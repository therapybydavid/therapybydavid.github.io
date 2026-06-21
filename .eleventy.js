const fs = require("fs");

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
    "images", "analytics.js", "site.webmanifest", "robots.txt", "sitemap.xml",
    "llms.txt", "chatbot.css", "chatbot.js", "david-robles-profile.jpeg",
    "david-robles-headshot.jpg", "therapy-by-david-logo.jpg",
    "therapy-by-david-logo.png", "TBD.png",
    "api", "card", "functions", "newsletters",
  ].forEach((p) => {
    if (fs.existsSync(p)) eleventyConfig.addPassthroughCopy({ [p]: p });
  });

  // Blog posts, ordered to match the curated sequence from the original index.
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByTag("blog").sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
  );

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
