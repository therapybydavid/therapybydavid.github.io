/* Therapy by David — sitewide GA4 + conversion events + lead-source capture.
   Included on every public page via <script src="/analytics.js" defer>.
   thank-you.html keeps its own inline GA snippet (it fires the
   booking-confirmed conversion) and does NOT load this file, so the
   GA config is never doubled on that page. */
(function () {
  var GA_ID = 'G-MZXKRYDMXT';

  /* ── GA4 loader ── */
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GA_ID);

  /* ── First-touch lead source. Captured once per browser session;
     the contact form copies these fields into each Firestore
     submission so every lead carries where it came from. ── */
  try {
    if (!sessionStorage.getItem('tbd_source')) {
      var q = new URLSearchParams(location.search);
      sessionStorage.setItem('tbd_source', JSON.stringify({
        referrer: document.referrer || '(direct)',
        landing_page: location.pathname,
        utm_source: q.get('utm_source') || null,
        utm_medium: q.get('utm_medium') || null,
        utm_campaign: q.get('utm_campaign') || null,
        first_seen: new Date().toISOString()
      }));
    }
  } catch (e) { /* private browsing — source capture is best-effort */ }

  /* ── Booking completed inside the Calendly popup or inline embed ── */
  window.addEventListener('message', function (e) {
    if (e.origin === 'https://calendly.com' && e.data &&
        e.data.event === 'calendly.event_scheduled') {
      gtag('event', 'consult_booked', { method: 'calendly' });
    }
  });

  /* ── High-intent taps: call, text ── */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest('a');
    if (a) {
      var href = a.getAttribute('href') || '';
      if (href.indexOf('tel:') === 0) gtag('event', 'call_click', { link_url: href });
      if (href.indexOf('sms:') === 0) gtag('event', 'text_click', { link_url: href });
    }
  });
})();
