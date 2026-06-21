module.exports = function (eleventyConfig) {
  // Copy the shared stylesheet (and any future assets) straight through to the build.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  // Copy existing site assets that pages reference (images, analytics, manifest).
  eleventyConfig.addPassthroughCopy({ "images": "images" });
  eleventyConfig.addPassthroughCopy({ "analytics.js": "analytics.js" });
  eleventyConfig.addPassthroughCopy({ "site.webmanifest": "site.webmanifest" });

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
