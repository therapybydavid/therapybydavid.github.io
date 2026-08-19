// Cloudflare Pages Function — receives the post-consult insurance details from
// /benefits and files them where David actually works: the lead's Trello card.
//
// Endpoint: POST /benefits-submit   Body: multipart/form-data (see FIELDS below)
//
// What it does, in order:
//   1. Finds the person's existing card on the lead board by name. Falls back to
//      creating one in "Pending Co-Pay" if they came in some other way.
//   2. Attaches the card photos (front, and back when supplied).
//   3. Comments the typed details, so the member ID is copyable text rather
//      than something to squint at in a photo.
//   4. Moves the card to "Pending Co-Pay", which is the state this submission
//      creates. That also lifts the card out of "Reached Out", so the idle
//      follow-up drip stops chasing someone who just responded.
//   5. Texts David that it landed. The SMS deliberately carries NO plan data:
//      just a first name and the card link. The detail lives on the card.
//
// SETUP — Cloudflare Pages → project → Settings → Variables and secrets:
//   TRELLO_KEY            Trello API key (write pair, not the read-only one)
//   TRELLO_TOKEN          Trello API token
//   TWILIO_ACCOUNT_SID    optional; without it the SMS step is skipped
//   TWILIO_AUTH_TOKEN     optional
//   TWILIO_FROM_NUMBER    optional, E.164
//   BENEFITS_KEY          optional; when set, /benefits?k=<value> is required
//
// Until TRELLO_KEY and TRELLO_TOKEN exist this returns "not-configured" (503)
// and changes nothing, so it is safe to deploy before the secrets are in place.

const TRELLO_BOARD = 'DCoD5VT4';        // same lead board the intake Worker uses
const TARGET_LIST  = 'Pending Co-Pay';
const DAVID_PHONE  = '+18325442562';

// Lists a live lead could be sitting in when they send this. "ME", "Not a Fit"
// and "Spam" are deliberately excluded so an old dead card never gets revived.
const SEARCH_LISTS = ['New Lead', 'Reached Out', 'Booked Call', 'Pending Co-Pay', 'Contacted for Appt', 'SMS'];

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const auth = (env) => `key=${encodeURIComponent(env.TRELLO_KEY)}&token=${encodeURIComponent(env.TRELLO_TOKEN)}`;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function clean(v, max = 200) {
  return String(v == null ? '' : v).slice(0, max).trim();
}

// "2001-04-09" -> "04/09/2001". Left alone if it isn't a plain ISO date.
function usDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : clean(iso, 40);
}

async function trelloLists(env) {
  const res = await fetch(`https://api.trello.com/1/boards/${TRELLO_BOARD}/lists?fields=name&${auth(env)}`);
  if (!res.ok) throw new Error(`lists ${res.status}`);
  return res.json();
}

// Match on the card title, which is how the intake Worker names lead cards.
// Exact first, then a containment check so "Mike Alvarez" still finds a card
// titled "Mike Alvarez (Open Path)".
async function findCard(env, lists, fullName) {
  const target = norm(fullName);
  if (!target) return null;
  const candidates = lists.filter((l) => SEARCH_LISTS.includes(l.name));
  const all = [];
  for (const list of candidates) {
    const res = await fetch(`https://api.trello.com/1/lists/${list.id}/cards?fields=name&${auth(env)}`);
    if (res.ok) all.push(...(await res.json()));
  }
  return (
    all.find((c) => norm(c.name) === target) ||
    all.find((c) => norm(c.name).includes(target) || target.includes(norm(c.name))) ||
    null
  );
}

async function createCard(env, listId, name) {
  const res = await fetch('https://api.trello.com/1/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      idList: listId,
      name: name || 'Insurance details',
      desc: 'Created by the /benefits form — no matching lead card was found.',
      pos: 'top',
      key: env.TRELLO_KEY,
      token: env.TRELLO_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`create ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function attach(env, cardId, bytes, type, label) {
  const fd = new FormData();
  // A fresh Blob from the raw bytes, rather than forwarding the File object we
  // got from request.formData(). Re-wrapping avoids the streaming/identity
  // quirks that make the forwarded object unreliable once deployed.
  fd.append('file', new Blob([bytes], { type: type || 'image/jpeg' }), label);
  fd.append('name', label);
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?${auth(env)}`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(`attach ${label}: ${res.status}`);
  return res.json();
}

async function comment(env, cardId, text) {
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}/actions/comments?${auth(env)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text, key: env.TRELLO_KEY, token: env.TRELLO_TOKEN }),
  });
  if (!res.ok) throw new Error(`comment ${res.status}`);
}

async function moveCard(env, cardId, listId) {
  await fetch(`https://api.trello.com/1/cards/${cardId}?${auth(env)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ idList: listId, pos: 'top', key: env.TRELLO_KEY, token: env.TRELLO_TOKEN }),
  });
}

async function textDavid(env, body) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) return 'skipped';
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: DAVID_PHONE, From: env.TWILIO_FROM_NUMBER, Body: body }),
    }
  );
  return res.ok ? 'sent' : `failed ${res.status}`;
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.TRELLO_KEY || !env.TRELLO_TOKEN) {
    return json({ ok: false, error: 'not-configured' }, 503);
  }
  if (env.BENEFITS_KEY) {
    const k = new URL(request.url).searchParams.get('k');
    if (k !== env.BENEFITS_KEY) return json({ ok: false, error: 'forbidden' }, 403);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'bad-request' }, 400);
  }

  const fullName = clean(form.get('full_name'), 120);
  const dob      = clean(form.get('dob'), 40);
  const carrier  = clean(form.get('carrier'), 80);
  const memberId = clean(form.get('member_id'), 60);
  const groupId  = clean(form.get('group_id'), 60);
  const isSelf   = clean(form.get('is_policyholder'), 8) === 'yes';
  const subName  = clean(form.get('subscriber_name'), 120);
  const subDob   = clean(form.get('subscriber_dob'), 40);
  const note     = clean(form.get('note'), 1000);

  if (!fullName || !dob || !carrier || !memberId) {
    return json({ ok: false, error: 'missing-fields' }, 400);
  }
  if (!isSelf && (!subName || !subDob)) {
    return json({ ok: false, error: 'missing-subscriber' }, 400);
  }

  const steps = [];
  const images = [];
  try {
    for (const [field, label] of [['card_front', 'card-front.jpg'], ['card_back', 'card-back.jpg']]) {
      const f = form.get(field);
      if (f && typeof f === 'object' && f.size > 0) {
        if (f.size > MAX_IMAGE_BYTES) return json({ ok: false, error: 'image-too-large' }, 413);
        images.push([await f.arrayBuffer(), f.type, label]);
        steps.push(`read:${label}`);
      }
    }
  } catch (err) {
    return json({ ok: false, error: `read-image: ${String(err.message || err)}`.slice(0, 200) }, 400);
  }
  if (!images.length) return json({ ok: false, error: 'missing-card-photo' }, 400);

  try {
    const lists  = await trelloLists(env);
    steps.push('lists');
    const target = lists.find((l) => l.name === TARGET_LIST);
    if (!target) throw new Error(`no "${TARGET_LIST}" list on the board`);

    let card = await findCard(env, lists, fullName);
    steps.push('find');
    const matched = !!card;
    if (!card) { card = await createCard(env, target.id, fullName); steps.push('create'); }

    // Attachments before the comment, so opening the card shows the photos
    // next to the text that describes them.
    const attached = [];
    for (const [bytes, type, label] of images) {
      try {
        await attach(env, card.id, bytes, type, label);
        attached.push(label.includes('front') ? 'front' : 'back');
        steps.push(`attach:${label}`);
      } catch (err) {
        // One bad photo must not lose the typed details.
        steps.push(`attach-failed:${label}:${String(err.message || err).slice(0, 60)}`);
      }
    }

    // Built as blocks joined by blank lines. A flat array with '' spacers does
    // not survive .filter(Boolean) — the empty strings get dropped with the
    // absent optional fields, and the comment comes out unevenly spaced.
    const plan = [
      `Name: ${fullName}`,
      `DOB: ${usDate(dob)}`,
      `Carrier: ${carrier}`,
      `Member ID: ${memberId}`,
      groupId ? `Group #: ${groupId}` : null,
    ].filter(Boolean).join('\n');

    const holder = isSelf
      ? 'Policyholder: themselves'
      : `**Policyholder: someone else — ${subName}, DOB ${usDate(subDob)}**\nVerify against this person, not the client.`;

    const photos = attached.length
      ? `Card photos attached: ${attached.join(' + ')}` +
        (attached.includes('back') ? '' : '\nThey did not send the back, so there is no payer ID.')
      : 'No card photo came through.';

    const lines = [
      '**Insurance details — sent from /benefits**',
      plan,
      holder,
      note ? `Their note: ${note}` : null,
      photos,
    ].filter(Boolean).join('\n\n');

    await comment(env, card.id, lines);
    steps.push('comment');
    await moveCard(env, card.id, target.id);
    steps.push('move');

    const first = fullName.split(/\s+/)[0] || fullName;
    const sms = await textDavid(
      env,
      `${first} sent their insurance details${isSelf ? '' : ' (someone else is the policyholder)'}. On their card: ${card.shortUrl || card.url || 'the lead board'}`
    );

    return json({ ok: true, matched, attached, sms, steps });
  } catch (err) {
    return json({ ok: false, error: String(err.message || err).slice(0, 200), steps }, 502);
  }
}

// A GET here is almost always someone opening the URL by hand.
export const onRequestGet = () =>
  new Response('This endpoint only accepts form submissions from /benefits.', {
    status: 405,
    headers: { 'Content-Type': 'text/plain' },
  });
