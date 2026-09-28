// Cloudflare Pages Function — puts every Calendly booking on the Trello lead
// board, not only the ones that came through /intake.
//
// Endpoint: POST /calendly-webhook   Calendly's "invitee.created" webhook.
//
// Why: lead cards were only ever made by the openpath-intake Worker, which the
// /intake and /contact forms call. Anyone who reached Calendly another way (a
// link from ChatGPT or Psychology Today, a newsletter, the Open Path page's
// inline embed) got a calendar event and no card.
//
// What it does, in order:
//   1. Checks Calendly's signature, so nothing else can put cards on the board.
//   2. Looks for the person's card in the live lead lists, by email and then
//      by name. /intake leads already have one by the time they book.
//   3. Found: moves it to "Booked Call" if it was still in "New Lead" or
//      "Reached Out" (which also stops the follow-up drip from chasing someone
//      who just booked), then comments the booking on it.
//      Not found: creates the card in "Booked Call" with their answers.
//   4. The Calendly invitee id goes on the card last, and is checked first, so
//      a retried delivery of the same booking changes nothing.
//
// SETUP — Cloudflare Pages → project → Settings → Variables and secrets:
//   TRELLO_KEY                     the same pair benefits-submit uses
//   TRELLO_TOKEN
//   CALENDLY_WEBHOOK_SIGNING_KEY   any long random string; the same value is
//                                  handed to Calendly when subscribing
// then subscribe with scripts/calendly-webhook.mjs (see its header).
//
// Until all three exist this returns "not-configured" (503) and changes
// nothing, so it is safe to deploy before the secrets are in place.

const TRELLO_BOARD  = 'DCoD5VT4';     // same lead board as benefits-submit and the intake Worker
const BOOKED_LIST   = 'Booked Call';
const FALLBACK_LIST = 'New Lead';      // new cards go here only if "Booked Call" is ever renamed

// Lists a live lead could be sitting in. "ME", "Not a Fit" and "Spam" are
// deliberately excluded so an old dead card never gets revived.
const LIVE_LISTS  = ['New Lead', 'Reached Out', 'Booked Call', 'Pending Co-Pay', 'Contacted for Appt', 'SMS'];
// The stages a booking moves a card out of. Later stages keep their place.
const BEFORE_CALL = ['New Lead', 'Reached Out'];

const TZ = 'America/Chicago';
// Calendly signs every delivery attempt fresh, so anything older is a replay.
const MAX_SIGNATURE_AGE_S = 5 * 60;

const SECRETS = ['TRELLO_KEY', 'TRELLO_TOKEN', 'CALENDLY_WEBHOOK_SIGNING_KEY'];

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const auth = (env) => `key=${encodeURIComponent(env.TRELLO_KEY)}&token=${encodeURIComponent(env.TRELLO_TOKEN)}`;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Card titles can carry a source tag, e.g. "Mike Alvarez (Open Path)".
const bareName = (s) => norm(String(s || '').replace(/\s*\([^)]*\)\s*$/, ''));

function clean(v, max = 200) {
  return String(v == null ? '' : v).slice(0, max).trim();
}

// Header: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${raw body}`>".
async function signedByCalendly(header, raw, secret) {
  const parts = {};
  for (const kv of String(header || '').split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const { t, v1 } = parts;
  if (!/^\d+$/.test(t || '') || !/^[0-9a-f]{64}$/i.test(v1 || '')) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > MAX_SIGNATURE_AGE_S) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sig = Uint8Array.from(v1.match(/../g), (h) => parseInt(h, 16));
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(`${t}.${raw}`));
}

// "Tue, Sep 29, 3:30 PM CT"
function central(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' CT';
}

// "+1 832-640-7334" and "+18326407334" both become "(832) 640-7334", the site's format.
function usPhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  const ten = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : clean(s, 40);
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g;

// Whole addresses only: "joe@gmail.com" must not match "billyjoe@gmail.com".
function hasEmail(text, email) {
  const t = String(text || '').toLowerCase();
  return t.includes(email) && (t.match(EMAIL_RE) || []).includes(email);
}

async function trelloLists(env) {
  const res = await fetch(`https://api.trello.com/1/boards/${TRELLO_BOARD}/lists?fields=name&${auth(env)}`);
  if (!res.ok) throw new Error(`lists ${res.status}`);
  return res.json();
}

// A list that fails to load throws rather than being skipped: skipping it
// could miss the person's card and create a duplicate, while a failure makes
// Calendly retry the delivery later.
async function liveCards(env, lists) {
  const live = lists.filter((l) => LIVE_LISTS.includes(l.name));
  const perList = await Promise.all(live.map(async (list) => {
    const res = await fetch(`https://api.trello.com/1/lists/${list.id}/cards?fields=name,desc,idList,shortUrl&${auth(env)}`);
    if (!res.ok) throw new Error(`cards ${list.name} ${res.status}`);
    return res.json();
  }));
  return perList.flat();
}

async function commentsMention(env, cardId, needle) {
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}/actions?filter=commentCard&fields=data&${auth(env)}`);
  if (!res.ok) throw new Error(`comments ${res.status}`);
  return (await res.json()).some((a) => String(a.data && a.data.text).includes(needle));
}

async function createCard(env, listId, name, desc) {
  const res = await fetch('https://api.trello.com/1/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ idList: listId, name, desc, pos: 'top', key: env.TRELLO_KEY, token: env.TRELLO_TOKEN }),
  });
  if (!res.ok) throw new Error(`create ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
  const res = await fetch(`https://api.trello.com/1/cards/${cardId}?${auth(env)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ idList: listId, pos: 'top', key: env.TRELLO_KEY, token: env.TRELLO_TOKEN }),
  });
  if (!res.ok) throw new Error(`move ${res.status}`);
}

export async function onRequestPost({ env, request }) {
  const missing = SECRETS.filter((k) => !env[k]);
  if (missing.length) return json({ ok: false, error: 'not-configured', missing }, 503);

  const raw = await request.text();
  const signature = request.headers.get('Calendly-Webhook-Signature');
  if (!(await signedByCalendly(signature, raw, env.CALENDLY_WEBHOOK_SIGNING_KEY))) {
    return json({ ok: false, error: 'bad-signature' }, 401);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }
  // Only new bookings touch the board. Any other event is acknowledged so
  // Calendly doesn't keep retrying it.
  const event = body && body.event;
  if (event !== 'invitee.created') return json({ ok: true, ignored: event || null });

  const p  = body.payload || {};
  const ev = p.scheduled_event || {};
  const inviteeId = clean(String(p.uri || '').split('/').pop(), 64);
  const email = clean(p.email, 200).toLowerCase();
  const name  = clean(p.name, 120) || clean([p.first_name, p.last_name].filter(Boolean).join(' '), 120) || email || 'Calendly booking';

  // On the consult (an outbound call) the event's location is the number David
  // dials. On inbound-call events that field is David's own number, so skip it.
  const loc = ev.location || {};
  const phones = [...new Set(
    [loc.type === 'outbound_call' ? loc.location : null, p.text_reminder_number].filter(Boolean).map(usPhone)
  )];

  const booking = [clean(ev.name, 120) || 'Calendly booking', central(ev.start_time)].filter(Boolean).join(' — ');
  const heading = `**${p.old_invitee ? 'Rescheduled' : 'Booked'} on Calendly: ${booking}**`;
  const contact = [
    phones.length ? `Phone: ${phones.join(' · ')}` : null,
    email ? `Email: ${email}` : null,
  ].filter(Boolean).join('\n');
  // Capped as a whole so the text stays well under Trello's 16,384-character
  // limit however many questions an event type asks. A card Trello refused
  // would fail on every retry.
  const answers = (Array.isArray(p.questions_and_answers) ? p.questions_and_answers : [])
    .filter((qa) => qa && clean(qa.answer))
    .map((qa) => `**${clean(qa.question, 200)}**\n${clean(qa.answer, 2000)}`)
    .join('\n\n')
    .slice(0, 10000);
  const ref = inviteeId ? `_Calendly ref ${inviteeId}_` : null;

  const steps = [];
  try {
    const lists = await trelloLists(env);
    steps.push('lists');
    const listName = new Map(lists.map((l) => [l.id, l.name]));
    const booked = lists.find((l) => l.name === BOOKED_LIST);

    const cards = await liveCards(env, lists);
    steps.push('cards');
    const card =
      (email && cards.find((c) => hasEmail(`${c.name}\n${c.desc}`, email))) ||
      (bareName(name) && cards.find((c) => bareName(c.name) === bareName(name))) ||
      null;

    if (card) {
      const recorded = inviteeId &&
        (String(card.desc).includes(inviteeId) || (await commentsMention(env, card.id, inviteeId)));
      if (recorded) {
        return json({ ok: true, action: 'already-recorded', card: card.shortUrl, steps });
      }
      // Move before commenting: the comment carries the ref, so if the move
      // fails the retry still finds this booking unrecorded and moves it.
      const moved = !!booked && BEFORE_CALL.includes(listName.get(card.idList));
      if (moved) {
        await moveCard(env, card.id, booked.id);
        steps.push('move');
      }
      await comment(env, card.id, [heading, contact, answers, ref].filter(Boolean).join('\n\n'));
      steps.push('comment');
      return json({ ok: true, action: 'commented', moved, card: card.shortUrl, steps });
    }

    const target = booked || lists.find((l) => l.name === FALLBACK_LIST) || lists[0];
    if (!target) throw new Error('the lead board has no lists');
    const desc = [
      heading,
      'Made from the Calendly booking: no lead card matched their email or name.',
      contact,
      answers,
      ref,
    ].filter(Boolean).join('\n\n');
    const created = await createCard(env, target.id, name, desc);
    steps.push('create');
    return json({ ok: true, action: 'created', list: target.name, card: created.shortUrl, steps });
  } catch (err) {
    // 424, as in benefits-submit: Cloudflare swaps an origin 502 for its own
    // error page. Any non-2xx makes Calendly retry the delivery later.
    return json({ ok: false, error: String(err.message || err).slice(0, 200), steps }, 424);
  }
}

// Opening the URL shows whether the secrets are in place. The setup script
// checks this before subscribing, so Calendly never gets pointed at an
// endpoint that would turn its deliveries away.
export const onRequestGet = ({ env }) => {
  const missing = SECRETS.filter((k) => !env[k]);
  return json({ ok: true, configured: missing.length === 0, missing });
};
