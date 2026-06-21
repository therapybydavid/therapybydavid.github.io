/* One-off migration helper: converts the existing hand-built blog/*.html
   articles into Eleventy Markdown files under src/blog/.
   Deterministic (no LLM): jsdom for parsing, turndown for prose -> Markdown.
   Schema blocks are carried over VERBATIM to preserve SEO exactly. */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const TurndownService = require("turndown");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "blog");
fs.mkdirSync(OUT, { recursive: true });

const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

const text = (el) => (el ? el.textContent.trim().replace(/\s+/g, " ") : "");
const attr = (el, a) => (el ? el.getAttribute(a) : null);
const absUrl = (u) => {
  if (!u) return "";
  if (/^https?:/i.test(u)) return u;
  u = u.replace(/^\.\.\//, "/");
  return u.startsWith("/") ? u : "/" + u;
};
const yaml = (s) => JSON.stringify(s == null ? "" : String(s)); // valid YAML flow scalar
function block(key, raw) {
  if (!raw) return "";
  const indented = raw.trim().split("\n").map((l) => "  " + l).join("\n");
  return `${key}: |\n${indented}\n`;
}

// 1) Read the index to get per-slug CARD data + ordering.
const indexHtml = fs.readFileSync(path.join(ROOT, "blog.html"), "utf8");
const idxDoc = new JSDOM(indexHtml).window.document;
const cards = {};
[...idxDoc.querySelectorAll(".post-card")].forEach((card, i) => {
  const href = attr(card.querySelector("a"), "href") || "";
  const slug = href.replace(/^.*blog\//, "").replace(/\.html$/, "");
  if (!slug) return;
  cards[slug] = {
    order: i,
    cardImage: attr(card.querySelector(".post-card-image"), "src"),
    cardAlt: attr(card.querySelector(".post-card-image"), "alt"),
    cardTag: text(card.querySelector(".tag")),
    cardDate: text(card.querySelector(".post-date")),
    cardTitle: text(card.querySelector("h2")),
    cardDescription: text(card.querySelector(".post-card-body p")),
  };
});

// 2) Convert each article.
const files = fs
  .readdirSync(path.join(ROOT, "blog"))
  .filter((f) => f.endsWith(".html") && f !== "post.html");
let done = 0;
const report = [];
for (const file of files) {
  const slug = file.replace(/\.html$/, "");
  const html = fs.readFileSync(path.join(ROOT, "blog", file), "utf8");
  const doc = new JSDOM(html).window.document;

  const title = text(doc.querySelector("title"));
  const description = attr(doc.querySelector('meta[name="description"]'), "content");
  const ogTitle = attr(doc.querySelector('meta[property="og:title"]'), "content");
  const ogDescription = attr(doc.querySelector('meta[property="og:description"]'), "content");
  const ogUrl = attr(doc.querySelector('meta[property="og:url"]'), "content");
  const canonical = attr(doc.querySelector('link[rel="canonical"]'), "href");

  // Schema blocks, classified and kept verbatim.
  let schemaJson = null, faqJson = null;
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    const raw = s.textContent.trim();
    if (/"@type"\s*:\s*"FAQPage"/.test(raw)) faqJson = raw;
    else schemaJson = raw;
  });

  const tag = text(doc.querySelector(".article-hero .tag"));
  const dateDisplay = text(doc.querySelector(".article-hero .article-date"));
  const h1 = text(doc.querySelector(".article-hero h1"));
  const deck = text(doc.querySelector(".article-hero .deck"));
  const image = attr(doc.querySelector(".featured-image img"), "src");
  const imageAlt = attr(doc.querySelector(".featured-image img"), "alt");
  const ctaH = text(doc.querySelector(".article-cta h3"));
  const ctaP = text(doc.querySelector(".article-cta p"));

  // Prose -> Markdown. Root-absolute any ../ relative links.
  const proseEl = doc.querySelector(".prose");
  if (!proseEl) continue; // skip non-article templates (e.g. blog/post.html)
  let md = td.turndown(proseEl.innerHTML);
  md = md.replace(/\]\(\.\.\//g, "](/");

  // Parse a sortable date from the display string ("May 9, 2026 · 6 min read").
  const dm = (dateDisplay || cards[slug]?.cardDate || "").split("·")[0].trim();
  const iso = dm && !isNaN(Date.parse(dm)) ? new Date(dm).toISOString().slice(0, 10) : "2026-01-01";

  const c = cards[slug] || {};
  let fm = "---\n";
  fm += `title: ${yaml(h1 || c.cardTitle || title)}\n`;
  fm += `pageTitle: ${yaml(title)}\n`;
  fm += `description: ${yaml(description)}\n`;
  if (ogTitle) fm += `ogTitle: ${yaml(ogTitle)}\n`;
  if (ogDescription) fm += `ogDescription: ${yaml(ogDescription)}\n`;
  fm += `ogType: article\n`;
  if (ogUrl) fm += `ogUrl: ${yaml(ogUrl)}\n`;
  if (canonical) fm += `canonical: ${yaml(canonical)}\n`;
  fm += `permalink: ${yaml("/blog/" + slug + "/")}\n`;
  fm += `date: ${iso}\n`;
  fm += `order: ${c.order != null ? c.order : 999}\n`;
  fm += `tag: ${yaml(tag || c.cardTag)}\n`;
  fm += `dateDisplay: ${yaml(dateDisplay)}\n`;
  if (deck) fm += `deck: ${yaml(deck)}\n`;
  if (image) fm += `image: ${yaml(absUrl(image))}\n`;
  if (imageAlt) fm += `imageAlt: ${yaml(imageAlt)}\n`;
  fm += `cardImage: ${yaml(absUrl(c.cardImage || image))}\n`;
  fm += `cardAlt: ${yaml(c.cardAlt || "")}\n`;
  fm += `cardTitle: ${yaml(c.cardTitle || h1)}\n`;
  fm += `cardTag: ${yaml(c.cardTag || tag)}\n`;
  fm += `cardDescription: ${yaml(c.cardDescription || deck || description)}\n`;
  fm += `cardDate: ${yaml(c.cardDate || dateDisplay)}\n`;
  if (ctaH) fm += `ctaHeading: ${yaml(ctaH)}\n`;
  if (ctaP) fm += `ctaText: ${yaml(ctaP)}\n`;
  fm += block("schemaJson", schemaJson);
  fm += block("faqJson", faqJson);
  fm += "---\n\n";

  fs.writeFileSync(path.join(OUT, slug + ".md"), fm + md + "\n");
  done++;
  report.push(`${String(c.order).padStart(2)} ${slug}  tag=${tag || c.cardTag}  faq=${faqJson ? "Y" : "-"}  mdlen=${md.length}`);
}

report.sort();
console.log(report.join("\n"));
console.log(`\nConverted ${done} posts -> src/blog/`);
