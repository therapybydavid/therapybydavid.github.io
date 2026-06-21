/* Migrates existing root HTML pages onto the SHARED nav/footer includes,
   while leaving each page's <head>, CSS, scripts and body untouched.
   Result: identical pages, but header/footer now come from one source
   (edit a link once -> every page updates). String-based (not DOM) so the
   rest of each file is preserved verbatim. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src");

// Pages that use the standard chrome and should share the nav/footer.
const PAGES = [
  "index", "about", "contact", "resources",
  "anxiety-therapy", "depression-therapy", "trauma-therapy",
  "mens-mental-health", "couples-therapy", "veterans-military-families",
  "anxiety", "depression", "trauma",
];

const NAV_RE = /<nav class="nav"[\s\S]*?<\/nav>/;
const FOOTER_RE = /<footer[\s\S]*?<\/footer>/;

const report = [];
for (const name of PAGES) {
  const src = path.join(ROOT, name + ".html");
  if (!fs.existsSync(src)) { report.push(`${name}: SOURCE MISSING`); continue; }
  let html = fs.readFileSync(src, "utf8");

  const hasNav = NAV_RE.test(html);
  const hasFooter = FOOTER_RE.test(html);
  html = html.replace(NAV_RE, '{% include "nav.njk" %}');
  html = html.replace(FOOTER_RE, '{% include "footer.njk" %}');

  const fm = `---\npermalink: /${name}.html\neleventyExcludeFromCollections: true\n---\n`;
  fs.writeFileSync(path.join(OUT, name + ".njk"), fm + html);
  report.push(`${name.padEnd(28)} nav=${hasNav ? "Y" : "NO!"} footer=${hasFooter ? "Y" : "NO!"}`);
}
console.log(report.join("\n"));
console.log(`\nWrote ${PAGES.length} page templates -> src/`);
