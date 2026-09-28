#!/usr/bin/env node
// Points Calendly at functions/calendly-webhook.js, and replays bookings that
// came in before it was listening. Node 18+, no dependencies.
//
//   export CALENDLY_TOKEN=...                Calendly → Integrations & apps →
//                                            API and webhooks → personal access token
//   export CALENDLY_WEBHOOK_SIGNING_KEY=...  the same value as the Cloudflare secret
//
//   node scripts/calendly-webhook.mjs status               is it deployed, subscribed, delivering?
//   node scripts/calendly-webhook.mjs create               subscribe new bookings (replaces any old one)
//   node scripts/calendly-webhook.mjs backfill 2026-09-28  send bookings made since that date
//                                                          through it; safe to repeat
//
// WEBHOOK_URL overrides the target (e.g. a *.pages.dev preview deployment).

import { createHmac } from 'node:crypto';

const API = 'https://api.calendly.com';
const ENDPOINT = process.env.WEBHOOK_URL || 'https://therapybydavid.com/calendly-webhook';
const TOKEN = process.env.CALENDLY_TOKEN;
const KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function calendly(pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : API + pathOrUrl;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) die(`Calendly ${init.method || 'GET'} ${url} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

// Every page of a Calendly collection.
async function all(pathOrUrl) {
  const out = [];
  for (let next = pathOrUrl; next; ) {
    const page = await calendly(next);
    out.push(...page.collection);
    next = page.pagination && page.pagination.next_page;
  }
  return out;
}

async function endpointStatus() {
  try {
    const res = await fetch(ENDPOINT);
    if (res.ok) return await res.json();
    return { configured: false, missing: [`it answered ${res.status}, so it is probably not deployed yet`] };
  } catch (err) {
    return { configured: false, missing: [`unreachable (${err.message})`] };
  }
}

async function requireReadyEndpoint() {
  const s = await endpointStatus();
  if (!s.configured) {
    die(`${ENDPOINT} is not ready: ${s.missing.join(', ')}.\n` +
      'Add the Cloudflare Pages secrets, redeploy, then run this again.');
  }
}

async function subscriptions(me) {
  const q = new URLSearchParams({ organization: me.current_organization, user: me.uri, scope: 'user', count: '100' });
  return (await all(`/webhook_subscriptions?${q}`)).filter((s) => s.callback_url === ENDPOINT);
}

function sign(body) {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac('sha256', KEY).update(`${t}.${body}`).digest('hex')}`;
}

const commands = {
  async status(me) {
    const s = await endpointStatus();
    console.log(`Endpoint: ${s.configured ? 'deployed and configured' : `NOT ready (${s.missing.join(', ')})`}`);
    const subs = await subscriptions(me);
    if (!subs.length) console.log('Calendly: not subscribed yet; run "create".');
    for (const sub of subs) {
      console.log(`Calendly: ${sub.state} since ${sub.created_at} for ${sub.events.join(', ')}` +
        (sub.retry_started_at ? `; deliveries failing, retrying since ${sub.retry_started_at}` : ''));
    }
  },

  // Replaces rather than reuses: Calendly can't re-enable a subscription it
  // disabled after failed deliveries, or change one's signing key.
  async create(me) {
    if (!KEY) die('Set CALENDLY_WEBHOOK_SIGNING_KEY, the same value as the Cloudflare secret.');
    await requireReadyEndpoint();
    for (const sub of await subscriptions(me)) {
      await calendly(sub.uri, { method: 'DELETE' });
      console.log(`Removed the old ${sub.state} subscription.`);
    }
    const { resource } = await calendly('/webhook_subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        url: ENDPOINT,
        events: ['invitee.created'],
        organization: me.current_organization,
        user: me.uri,
        scope: 'user',
        signing_key: KEY,
      }),
    });
    console.log(`Subscribed (${resource.state}): new Calendly bookings now post to ${ENDPOINT}`);
  },

  // Builds the same payload Calendly would have sent, from the API's own
  // records, and signs it the same way.
  async backfill(me, since) {
    if (!KEY) die('Set CALENDLY_WEBHOOK_SIGNING_KEY, the same value as the Cloudflare secret.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since || '')) die('Usage: backfill YYYY-MM-DD');
    await requireReadyEndpoint();
    const from = new Date(`${since}T00:00:00Z`);
    // Nothing booked on or after `from` can start before it, so this narrows
    // the events; each invitee's created_at decides the rest.
    const q = new URLSearchParams({
      user: me.uri, status: 'active', min_start_time: from.toISOString(), sort: 'start_time:asc', count: '100',
    });
    let sent = 0;
    for (const ev of await all(`/scheduled_events?${q}`)) {
      for (const inv of await all(`${ev.uri}/invitees?status=active&count=100`)) {
        if (new Date(inv.created_at) < from) continue;
        const body = JSON.stringify({
          event: 'invitee.created',
          created_at: inv.created_at,
          created_by: me.uri,
          payload: { ...inv, scheduled_event: ev },
        });
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Calendly-Webhook-Signature': sign(body) },
          body,
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) process.exitCode = 1;
        const result = res.status === 401 ? 'FAILED: signing key here does not match the Cloudflare secret'
          : !res.ok ? `FAILED ${res.status} ${out.error || ''}`
          : out.action === 'created' ? `card created in ${out.list}`
          : out.action === 'commented' ? `added to their card${out.moved ? ', moved to Booked Call' : ''}`
          : 'already on the board';
        console.log(`${inv.created_at.slice(0, 10)}  ${inv.name}: ${result}${out.card ? `  ${out.card}` : ''}`);
        sent++;
      }
    }
    if (!sent) console.log(`No active bookings made since ${since}.`);
  },
};

const [cmd, arg] = process.argv.slice(2);
if (!commands[cmd]) die('Usage: node scripts/calendly-webhook.mjs status | create | backfill YYYY-MM-DD');
if (!TOKEN) die('Set CALENDLY_TOKEN (Calendly → Integrations & apps → API and webhooks).');
const { resource: me } = await calendly('/users/me');
await commands[cmd](me, arg);
