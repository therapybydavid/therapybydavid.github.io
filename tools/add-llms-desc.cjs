/* One-off: pull each article's hand-written llms.txt blurb into the matching
   Markdown post as `llmsDescription`, so the generated llms.txt reads identically
   while becoming self-updating. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const txt = fs.readFileSync(path.join(ROOT, "llms.txt"), "utf8");

// Match only blog article lines: - [Title](https://therapybydavid.com/blog/<slug>): blurb
const re = /^- \[(.+?)\]\(https:\/\/therapybydavid\.com\/blog\/([a-z0-9-]+)\): (.+)$/gm;
let m, n = 0, missing = [];
while ((m = re.exec(txt))) {
  const [, , slug, blurb] = m;
  const md = path.join(ROOT, "src", "blog", slug + ".md");
  if (!fs.existsSync(md)) { missing.push(slug); continue; }
  let content = fs.readFileSync(md, "utf8");
  if (/^llmsDescription:/m.test(content)) {
    content = content.replace(/^llmsDescription:.*$/m, "llmsDescription: " + JSON.stringify(blurb));
  } else {
    content = content.replace(/^---\n/, "---\nllmsDescription: " + JSON.stringify(blurb) + "\n");
  }
  fs.writeFileSync(md, content);
  n++;
}
console.log(`Injected llmsDescription into ${n} posts.`);
if (missing.length) console.log("No matching .md for:", missing.join(", "));
