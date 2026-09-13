// Cloudflare Turnstile configuration (spam protection for the contact form).
//
// siteKey is the PUBLIC key from Cloudflare dashboard -> Turnstile. It is meant
// to appear in page source, so it is safe to commit.
//
// While siteKey is empty, Turnstile is OFF: no widget, no script, and no gate
// in the submit handler. The contact form renders and submits exactly as it
// does today. Setting the key is what turns the whole feature on.
//
// Two ways to set it:
//   1. Cloudflare Pages -> Settings -> Variables and secrets -> add a plain
//      variable named TURNSTILE_SITE_KEY (available to the build). Preferred:
//      it sits on the same screen as the secret, and needs no code change.
//   2. Paste the key into fallbackSiteKey below and commit.
//
// The matching SECRET key goes in that same Cloudflare screen as a *Secret*
// named TURNSTILE_SECRET_KEY, read server-side by functions/verify-turnstile.js.
// Until that secret exists the endpoint answers 503 "not-configured" and the
// form deliberately fails open -- see the gate in src/contact.njk.

const fallbackSiteKey = '';

module.exports = {
  siteKey: (process.env.TURNSTILE_SITE_KEY || fallbackSiteKey).trim(),
};
