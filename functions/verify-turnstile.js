// Cloudflare Pages Function — server-side verification for Cloudflare Turnstile.
// Endpoint: POST /verify-turnstile   Body: { "token": "<cf-turnstile-response>" }
//
// SETUP (do this when you're ready to turn on spam protection):
//   1. Cloudflare dashboard → Turnstile → add a widget for therapybydavid.com.
//      You'll get a SITE KEY (public) and a SECRET KEY (private).
//   2. Cloudflare Pages → your project → Settings → Variables and secrets:
//        • TURNSTILE_SECRET_KEY  — the SECRET key, added as a *Secret*
//        • TURNSTILE_SITE_KEY    — the SITE key, added as a plain Variable
//      (the site key can instead be committed to src/_data/turnstile.js).
//   3. Redeploy. That is the whole activation — no code change needed.
//
// The front end reads the site key from src/_data/turnstile.js and only renders
// the widget and enforces the gate when it is non-empty. Until then, and until
// TURNSTILE_SECRET_KEY is set (this endpoint answers 503 "not-configured"), the
// contact form behaves exactly as it did before — safe to deploy as-is.

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
