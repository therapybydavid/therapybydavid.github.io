const fs = require("fs");
const { execFileSync } = require("child_process");

// --- Real last-modified dates, read from git ----------------------------
// Sitemap <lastmod> and schema dateModified were previously hand-typed or
// copied from the publish date, so every "freshness" signal the site sent
// was wrong. These read the actual last commit that touched a file.

function _git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (e) {
    return "";
  }
}

// A shallow checkout makes every file look like it was added in the tip
// commit, which would stamp every URL with the deploy date — the same
// fabricated freshness this is meant to remove. Cloudflare Pages checks out
// shallow, so in CI we read the precomputed map that `npm run build` writes
// locally (scripts/gen-git-dates.js) instead of asking git.
const GIT_USABLE = _git(["rev-parse", "--is-shallow-repository"]) === "false";

let GIT_DATES = {};
try {
  GIT_DATES = require("./src/_data/gitdates.json");
} catch (e) {
  GIT_DATES = {}; // not generated yet; callers fall back to declared dates
}

const _gitDateCache = new Map();
function gitLastmod(file) {
  if (!file) return "";
  const key = String(file).replace(/^\.\//, "");
  if (_gitDateCache.has(key)) return _gitDateCache.get(key);
  // Live git when the history is really there, otherwise the committed map.
  const out = (GIT_USABLE ? _git(["log", "-1", "--format=%cs", "--", key]) : "") || GIT_DATES[key] || "";
  _gitDateCache.set(key, out);
  return out;
}

module.exports = function (eleventyConfig) {
  // The shared stylesheet + Eleventy-managed assets.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // --- Hybrid build -------------------------------------------------------
  // Eleventy OWNS the blog (index + posts, generated from Markdown). Every
  // other existing page, asset, and backend folder is passed through to the
  // build verbatim, so the live site is preserved exactly. Pages can be
  // moved onto the shared template later, one at a time, with no re-cutover.

  // Eleventy generates these, so they must NOT be passed through:
  const ELEVENTY_OWNS = new Set(["blog.html"]); // /blog and /blog/* come from src/

  // Every root-level .html page (home, about, services, utility pages, etc.)
  // is passed through AS-IS, UNLESS it has been templated into src/ (then
  // Eleventy generates it from the template instead).
  fs.readdirSync(".").forEach((f) => {
    if (f.endsWith(".html") && !ELEVENTY_OWNS.has(f)) {
      const templated = "src/" + f.replace(/\.html$/, ".njk");
      if (fs.existsSync(templated)) return; // Eleventy owns this page now
      eleventyConfig.addPassthroughCopy({ [f]: f });
    }
  });

  // Root-level asset files and directories (backend functions, images, etc.).
  // NOTE: the "blog" directory is intentionally excluded — Eleventy builds it.
  [
    "images", "analytics.js", "site.webmanifest", "robots.txt", "_headers", "_redirects",
    // IndexNow ownership proof. Bing fetches this file to confirm we control the
    // domain before accepting URL submissions; its contents must equal its name.
    "3d9d1c44f4c79e3d15bcb945defc5033.txt",
    "david-robles-profile.jpeg",
    "david-robles-headshot.jpg", "david-robles-headshot.webp",
    "david-robles-headshot-360.webp", "david-robles-profile.webp",
    "david-robles-profile-96.webp", "therapy-by-david-logo.jpg",
    "card", "newsletters",
  ].forEach((p) => {
    if (fs.existsSync(p)) eleventyConfig.addPassthroughCopy({ [p]: p });
  });

  // Blog posts, newest first. Every post carries a real `date:` in frontmatter
  // (the agent stamps publish day), so new articles land at the top of /blog
  // automatically. The old curated `order:` field is ignored.
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByTag("blog").sort((a, b) => b.date - a.date)
  );

  // Parse a JSON string (e.g. the faqJson frontmatter) into an object so the
  // template can render a visible FAQ section from the same source as the schema.
  eleventyConfig.addFilter("fromJson", (s) => {
    try { return JSON.parse(s); } catch (e) { return null; }
  });

  // Word count for BlogPosting schema, computed from the rendered post body
  // so the markup can never drift from the actual article length.
  eleventyConfig.addFilter("wordCount", (html) =>
    String(html || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length
  );

  // Strip the .html extension from a built URL. Posts are written to
  // /blog/<slug>.html but Cloudflare Pages serves them at /blog/<slug> and
  // 308-redirects the .html form, so every internal link must use the
  // extensionless URL or each crawl costs an extra hop to a non-canonical URL.
  eleventyConfig.addFilter("cleanUrl", (u) => String(u || "").replace(/\.html$/, ""));

  // Last commit date for a file, as YYYY-MM-DD. Empty string when git is
  // unavailable or the checkout is shallow, so templates can fall back.
  eleventyConfig.addFilter("gitLastmod", gitLastmod);

  // Date helpers — written by hand so the build needs no extra dependencies.
  eleventyConfig.addFilter("dateISO", (d) => new Date(d).toISOString().slice(0, 10));

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  eleventyConfig.addFilter("readableDate", (d) => {
    const dt = new Date(d);
    return `${months[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
  });

  // Fail the build if any page emits unparseable JSON-LD. Without this the
  // failure is invisible: a post missing one frontmatter field renders a
  // normal-looking page, the build succeeds, and Google silently discards
  // the whole structured-data block.
  eleventyConfig.addTransform("validateJsonLd", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(content))) {
      try {
        JSON.parse(m[1]);
      } catch (e) {
        throw new Error(
          `Invalid JSON-LD in ${this.page.inputPath}: ${e.message}\n${m[1].slice(0, 300)}`
        );
      }
    }
    return content;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
