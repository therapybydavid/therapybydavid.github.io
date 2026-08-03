// Cloudflare Pages Function — receives Calendly booking webhooks and feeds them
// into the same notification pipeline the forms already use.
// Endpoint: POST /calendly-webhook
//
// WHY THIS EXISTS
// The Trello card, the SMS alert and the AI-drafted reply are all created by the
// openpath-intake Worker, and the only things that called it were the intake
// form and the contact form. A booking made from a raw Calendly link that never
// touches the site — a Psychology Today profile, an email signature, a business
// card — landed on the calendar with no card, no text and no email. This closes
// that gap: Calendly itself tells us, and we hand the lead to the same Worker.
//
// It deliberately does NOT talk to Trello/Notion/Textbelt directly. Those keys
// live in the Worker and the routing logic lives there too; this endpoint only
// translates a Calendly payload into the shape /contact-notify already accepts.
// One pipeline, one place to change it.
//
// SETUP (three steps, all free tier):
//   1. Cloudflare Pages → project → Settings → Variables and secrets → add
//      CALENDLY_WEBHOOK_SIGNING_KEY (as a Secret). You get its value in step 2.
//   2. Register the webhook with Calendly (one-time, needs a Calendly API
//      personal access token — Calendly → Integrations → API & Webhooks):
//
//        curl -X POST https://api.calendly.com/webhook_subscriptions \
//          -H "Authorization: Bearer $CALENDLY_TOKEN" \
//          -H "Content-Type: application/json" \
//          -d '{
//                "url": "https://therapybydavid.com/calendly-webhook",
//                "events": ["invitee.created"],
//                "organization": "<your organization URI>",
//                "user": "<your user URI>",
//                "scope": "user"
//              }'
//
//      The response contains the signing key — that is the value for step 1.
//      Get the two URIs from: curl -H "Authorization: Bearer $CALENDLY_TOKEN" \
//                                  https://api.calendly.com/users/me
//   3. Deploy. Book a test slot from an incognito window using the plain
//      calendly.com link (NOT through the site) and confirm a Trello card lands.
//
// Until CALENDLY_WEBHOOK_SIGNING_KEY is set this endpoint returns
// "not-configured" (503) and changes nothing — it is safe to deploy as-is.

const NOTIFY_URL = 'https://openpath-intake.roblesinc.workers.dev/contact-notify';

// Calendly signs with t=<unix seconds>,v1=<hex hmac>. Reject anything older than
// this so a captured request can't be replayed later. Calendly suggests 3 min.
const TOLERANCE_SECONDS = 180;

export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = { 'Content-Type': 'application/json' };

  try {
    if (!env.CALENDLY_WEBHOOK_SIGNING_KEY) {
      return Response.json({ ok: false, error: 'not-configured' }, { status: 503, headers });
    }

    // Read the raw body once: the signature covers the exact bytes Calendly
    // sent, so it must be verified before anything re-serializes it.
    const raw = await request.text();
    const signature = request.headers.get('Calendly-Webhook-Signature') || '';

    const verified = await verifySignature(raw, signature, env.CALENDLY_WEBHOOK_SIGNING_KEY);
    if (!verified.ok) {
      return Response.json({ ok: false, error: verified.error }, { status: 401, headers });
    }

    const body = JSON.parse(raw);

    // Only new bookings create leads. Cancellations arrive as invitee.canceled
    // and are acknowledged but ignored: /contact-notify only knows how to make
    // a "New Lead" card, and a cancellation is not a new lead. Wiring those up
    // needs a cancellation path in the Worker itself.
    if (body.event !== 'invitee.created') {
      return Response.json({ ok: true, skipped: body.event || 'unknown-event' }, { headers });
    }

    const p = body.payload || {};

    // Bookings that came through the site were already reported to the Worker by
    // the intake form before it redirected here, so notifying again would put a
    // second card on the board for one person. intake.html tags its redirect
    // with utm_source=site; anything carrying that tag is a duplicate.
    if ((p.tracking && p.tracking.utm_source) === 'site') {
      return Response.json({ ok: true, skipped: 'already-notified-by-intake-form' }, { headers });
    }

    const payload = toNotifyPayload(p);

    const res = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Report the Worker's verdict back to Calendly. A non-2xx here makes
    // Calendly retry, which is what we want — a dropped booking is the exact
    // failure this endpoint exists to prevent.
    if (!res.ok) {
      return Response.json({ ok: false, error: 'notify-failed' }, { status: 502, headers });
    }

    return Response.json({ ok: true }, { headers });
  } catch (err) {
    return Response.json({ ok: false, error: 'server-error' }, { status: 500, headers });
  }
}

/* ---------------------------------------------------------------- helpers -- */

// Translate Calendly's invitee payload into the body /contact-notify expects.
function toNotifyPayload(p) {
  const ev = p.scheduled_event || {};
  const { first, last } = splitName(p);

  return {
    first_name: first,
    last_name: last,
    from_email: p.email || '',
    phone: pickPhone(p, ev),
    message: buildSummary(p, ev),
    // Calendly collects its own SMS-reminder consent, which is not the same
    // consent as the site's marketing opt-in. Never infer one from the other.
    sms_opt_in: false,
    lead_source: (p.tracking && p.tracking.utm_source) || 'Calendly (direct link)',
  };
}

function splitName(p) {
  if (p.first_name || p.last_name) {
    return { first: p.first_name || '', last: p.last_name || '' };
  }
  const parts = String(p.name || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts.shift() || '', last: parts.join(' ') };
}

// Phone-call events put the invitee's number in the event location; everyone
// else may have given one for text reminders. Either is better than none.
function pickPhone(p, ev) {
  const loc = ev.location || {};
  const fromLocation = typeof loc.location === 'string' ? loc.location : '';
  const isPhone = /^\+?[\d\s().-]{7,}$/.test(fromLocation);
  return p.text_reminder_number || (isPhone ? fromLocation : '') || '';
}

// A single readable block for the Trello card and the SMS alert — what they
// booked, when, and anything they typed into the booking questions.
function buildSummary(p, ev) {
  const lines = [];
  lines.push('Booked via Calendly: ' + (ev.name || 'consultation'));

  if (ev.start_time) {
    lines.push('When: ' + formatWhen(ev.start_time, p.timezone));
  }
  if (p.timezone) lines.push('Invitee time zone: ' + p.timezone);

  const qas = Array.isArray(p.questions_and_answers) ? p.questions_and_answers : [];
  for (const qa of qas) {
    const answer = String((qa && qa.answer) || '').trim();
    if (answer) lines.push((qa.question || 'Question') + ': ' + answer);
  }

  if (p.reschedule_url) lines.push('Reschedule: ' + p.reschedule_url);
  if (p.cancel_url) lines.push('Cancel: ' + p.cancel_url);

  return lines.join('\n');
}

// Render in the practice's timezone so the alert reads the way David thinks
// about his day, falling back to the raw ISO string if Intl rejects the zone.
function formatWhen(iso, inviteeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Chicago',
    }).format(new Date(iso)) + ' (Central)';
  } catch (err) {
    return iso + (inviteeZone ? ' (' + inviteeZone + ')' : '');
  }
}

// HMAC-SHA256 over "<timestamp>.<raw body>", compared in constant time.
async function verifySignature(raw, header, key) {
  const parts = Object.fromEntries(
    String(header)
      .split(',')
      .map((kv) => kv.trim().split('='))
      .filter((pair) => pair.length === 2)
  );

  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return { ok: false, error: 'malformed-signature' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, error: 'stale-signature' };
  }

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(timestamp + '.' + raw));
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, error: 'bad-signature' };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
