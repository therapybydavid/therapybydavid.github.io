# Therapy by David — Project Context

## About the Site
- **Domain:** therapybydavid.com
- **Owner:** David Robles (roblesinc@gmail.com)
- **Type:** Static HTML therapy practice website
- **Hosting:** Cloudflare Pages (free tier), deployed from GitHub
- **GitHub repo:** `therapybydavid/therapybydavid.github.io`
- **Local project folder:** `/Users/robles/Houston-Therapy/`

## Tech Stack
- Pure HTML/CSS/JS — no build tools, no frameworks
- **Firebase Firestore** (Blaze plan) — stores contact form submissions
  - Project ID: `therapy-by-david`
  - Collection: `contact_submissions` (write-only via security rules)
- **EmailJS** (free tier, 200 emails/month) — sends email notification to David on form submission
  - Service ID: `service_3di4nuj`
  - Template ID: `template_qz7ewhr`
  - Public Key: `C2aEWR5X0R26UneeK`
- **Calendly** — booking system
  - URL: `https://calendly.com/roblesinc/consultation`
  - Inline embed on `contact.html`
  - Popup widget triggered by all consultation buttons on `index.html`

## ⚠️ LCSW Tracker — SEPARATE repo (David's main data app)
- **What it is:** "LCSW hour and client tracker." In David's words: *"this is where all my data lives."* Treat as high-importance.
- **Live URL:** `https://therapybydavid.github.io/lcsw-tracker/`
- **Source code:** lives in a **SEPARATE GitHub repo `therapybydavid/lcsw-tracker`** — it is NOT part of this (`therapybydavid.github.io`) repo. It is served at the `/lcsw-tracker/` path via GitHub Pages "project site" routing (a sibling repo mounted under that path). Do not look for it here.
- **Where its DATA is stored:** ❓ **NOT YET CONFIRMED.** Could not be verified from a Claude Code web session because (a) outbound network is blocked (the live page returns HTTP 403), and (b) GitHub access is scoped to only `therapybydavid.github.io`, so the `lcsw-tracker` repo can't be read. David suspects it may be "tied to Cloudflare" — unverified. (For reference, the main site uses Firebase project `therapy-by-david` + Cloudflare; lcsw-tracker's backend is unknown.)
- **To confirm the data backend / edit this page from Claude:** either add `therapybydavid/lcsw-tracker` to the session's allowed repositories, or paste the page's `<script>`/config section into chat.
- **Parked request:** David wants a link on this page pointing to `http://localhost:8083/Clients/lcsw-dashboard.html` (a local-only dashboard URL). That edit must happen in the `lcsw-tracker` repo, not this one.

## Pages
- `index.html` — Homepage
- `contact.html` — Contact form + inline Calendly embed
- `about.html` — About David
- `anxiety.html`, `depression.html`, `trauma.html` — Service pages
- `blog.html` — Blog listing
- `resources.html` — Resources page
- `quiz.html` — Symptom checker quiz

## Key Design Details
- **Color palette:** dark background (`#080b10`), gold accent (`#b99138`), champagne (`#c8a96e`)
- **CSS variable for gold:** `var(--gold)`
- **Fonts:** Playfair Display (headings), Inter (body)
- **Photos:** `david-robles-headshot.jpg` used on homepage; `david-robles-profile.jpeg` used on About page

## What's Been Done
- Footer "Explore" section standardized to 4 links across all pages: Home, Services, About David, Telehealth in Texas
- FAQ questions on homepage reordered by user journey logic
- Contact form replaced Formspree with Firebase + EmailJS
- All form field placeholders removed; phone auto-formats to (832) 123-4567 as user types
- Calendly inline embed added to contact page (dark theme matching site)
- All consultation buttons on homepage (`index.html`) now trigger Calendly popup instead of linking to ClientSecure
- Homepage headshot updated to `david-robles-headshot.jpg`

## Calendly Account
- David has a **Calendly Pro account**
- Pro means branding/watermark can be removed — done in Calendly → Account Settings → Branding
- Event URL: `https://calendly.com/roblesinc/consultation`
- Event name: "Free 15-Minute Phone Consultation"

## Still Using ClientSecure
- Other pages (About, Services, etc.) may still have ClientSecure links — not yet updated to Calendly
- Old system: `https://david-robles.clientsecure.me/request/service` (being phased out in favor of Calendly)

## Pending / To-Do
- Update consultation links on About, Services (anxiety, depression, trauma, telehealth) pages to use Calendly popup instead of ClientSecure
- Remove Calendly "Powered by Calendly" badge via Calendly Pro account settings
- Consider whether `mailchimp-campaign.html` and `netlify/` folder are still needed (can be cleaned up)

## Preview Server
- Launch config: `.claude/launch.json`
- Server name: `Therapy by David (static)` — runs on port 8080

## Business Info
- David is a licensed psychotherapist in Texas
- Offers telehealth across Texas + in-person in Pasadena and Webster, TX
- Specialties: anxiety, trauma, burnout, overthinking, men's mental health, veterans
- Practice email: roblesinc@gmail.com
- Contact form submissions are stored in Firebase and emailed to roblesinc@gmail.com via EmailJS

## Workflow Notes
- David prefers Calendly popup (not redirect to ClientSecure) for all booking CTAs
- Contact page uses inline Calendly embed; all other pages use popup trigger
- No floating badge widget — keep pages clean
- Firebase Firestore is write-only for contact submissions (security rules enforce this)
- EmailJS free tier allows 200 emails/month; upgrade if volume increases
