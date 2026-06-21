// Cloudflare Pages Function — server-side verification for Cloudflare Turnstile.
// Endpoint: POST /verify-turnstile   Body: { "token": "<cf-turnstile-response>" }
//
// SETUP (do this when you're ready to turn on spam protection):
//   1. Cloudflare dashboard → Turnstile → add a widget for therapybydavid.com.
//      You'll get a SITE KEY (public) and a SECRET KEY (private).
//   2. Put the SECRET KEY in Cloudflare Pages → your project → Settings →
//      Variables and secrets → add  TURNSTILE_SECRET_KEY  (as a Secret).
//   3. Put the SITE KEY into the contact form widget (see src/contact.njk).
//
// Until TURNSTILE_SECRET_KEY is set, this endpoint returns "not-configured"
// (503) and changes nothing — it is safe to deploy as-is.

export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = { 'Content-Type': 'application/json' };

  try {
    if (!env.TURNSTILE_SECRET_KEY) {
      return Response.json(
        { success: false, error: 'not-configured' },
        { status: 503, headers }
      );
    }

    const body = await request.json().catch(() => ({}));
    const token = body && body.token;
    if (!token) {
      return Response.json(
        { success: false, error: 'missing-token' },
        { status: 400, headers }
      );
    }

    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', token);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) form.append('remoteip', ip);

    const verify = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: form }
    );
    const data = await verify.json();

    return Response.json(
      { success: !!data.success, errors: data['error-codes'] || [] },
      { status: data.success ? 200 : 403, headers }
    );
  } catch (err) {
    return Response.json(
      { success: false, error: 'server-error' },
      { status: 500, headers }
    );
  }
}
