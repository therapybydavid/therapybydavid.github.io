---
# ─────────────────────────────────────────────────────────────
# NEW POST TEMPLATE — copy this file, rename it (no underscore),
# fill every placeholder marked with ALL_CAPS, then delete this
# comment block.
#
# CHECKLIST before publishing:
#   [ ] Rename file (slug must match ogUrl/canonical/permalink)
#   [ ] Write all frontmatter fields below
#   [ ] Add schemaJson (BlogPosting)
#   [ ] Add faqJson (5 Q&As from the post content)
#   [ ] Image: pick from Unsplash, download or use CDN link
#   [ ] Tag matches one of the allowed values (see tag field)
#   [ ] Houston/Texas appears in description AND keywords
#   [ ] Run `npx @11ty/eleventy --quiet` to confirm no build errors
# ─────────────────────────────────────────────────────────────

# Shown to AI search engines (ChatGPT, Perplexity, Claude) — one punchy sentence.
llmsDescription: "BRIEF_ONE_LINE_HOOK_FOR_AI_SEARCH"

title: "POST TITLE"
pageTitle: "POST TITLE | Therapy by David"
description: "155-160 char meta description. Must mention Houston or Texas. Example: If you live in Houston and struggle with X, a therapist can help you understand what's driving the pattern."
ogTitle: "POST TITLE"
ogDescription: "Same as description or a shorter variation."
ogType: article
ogUrl: "https://therapybydavid.com/blog/YOUR-SLUG-HERE"
canonical: "https://therapybydavid.com/blog/YOUR-SLUG-HERE"
permalink: "/blog/YOUR-SLUG-HERE.html"

date: YYYY-MM-DD
order: 50
# Tag must be one of: Anxiety | Depression | Trauma | Burnout | Veterans | Men's Mental Health | Relationships | Getting Started
tag: "Anxiety"

dateDisplay: "Month DD, YYYY · X min read"
deck: "One-sentence hook shown under the headline on the post page."

cardTitle: "POST TITLE"
cardTag: "Anxiety"
cardDescription: "Card blurb for the blog index (1-2 sentences, no location required)."
cardDate: "Month DD, YYYY · X min read"

ctaHeading: "Ready to work on this?"
# ctaText is optional — delete the line to use the site default
ctaText: "Schedule a free 15-minute consultation. No pressure — just a real conversation about what's going on and what support might help."

image: "https://images.unsplash.com/photo-PHOTO_ID?auto=format&fit=crop&w=1400&q=85"
imageAlt: "Describe the image for screen readers"
cardImage: "https://images.unsplash.com/photo-PHOTO_ID?auto=format&fit=crop&w=800&q=80"
cardAlt: "Describe the image for screen readers"

keywords: "TOPIC Houston, TOPIC Texas, TOPIC therapy Houston, therapist Pasadena TX, telehealth therapy Texas, David Robles LMSW"

schemaJson: |
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "POST TITLE",
    "description": "Same as description field above.",
    "image": "https://images.unsplash.com/photo-PHOTO_ID?auto=format&fit=crop&w=1200&h=630&q=80",
    "author": { "@type": "Person", "name": "David Robles", "jobTitle": "Licensed Master Social Worker", "url": "https://therapybydavid.com/#about" },
    "publisher": { "@type": "Organization", "name": "Therapy by David", "url": "https://therapybydavid.com/" },
    "datePublished": "YYYY-MM-DD",
    "dateModified": "YYYY-MM-DD",
    "url": "https://therapybydavid.com/blog/YOUR-SLUG-HERE",
    "mainEntityOfPage": "https://therapybydavid.com/blog/YOUR-SLUG-HERE",
    "wordCount": "WORD_COUNT",
    "articleSection": "Anxiety",
    "keywords": "TOPIC Houston, TOPIC Texas, therapist Houston TX, therapy Texas, telehealth therapy Texas"
  }

faqJson: |
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "QUESTION 1 — something a person would Google about this topic",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Answer in David's voice — direct, grounded, 2-4 sentences. No hype, no hedging."
        }
      },
      {
        "@type": "Question",
        "name": "QUESTION 2",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Answer."
        }
      },
      {
        "@type": "Question",
        "name": "QUESTION 3",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Answer."
        }
      },
      {
        "@type": "Question",
        "name": "QUESTION 4 — often a 'how long / how do I know if I need help' type",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Answer."
        }
      },
      {
        "@type": "Question",
        "name": "Is there a therapist in Houston who works with TOPIC?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes. Therapy by David is a private-pay practice in Houston, Texas working with adults navigating TOPIC. Sessions are available in person in the Houston area and via telehealth across Texas."
        }
      }
    ]
  }
---

## Your First Section Heading

Post body goes here. Write in Markdown. Use `##` for H2, `###` for H3.

Keep David's voice: direct, human, no hype, no emoji, no corporate filler.
Contractions are fine. Sharp questions welcome. No fluff.

Do NOT use performance language (level up, unlock, breakthrough, unstoppable).
DO use: understanding, patterns, awareness, practical change, emotional experience.
