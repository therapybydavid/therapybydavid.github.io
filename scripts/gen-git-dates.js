#!/usr/bin/env node
// Writes src/_data/gitdates.json: a map of source file -> date of the last
// commit that touched it. The sitemap and BlogPosting schema read it for
// <lastmod> and dateModified.
//
// Why a committed file instead of asking git at build time: Cloudflare Pages
// checks out shallow, so in CI every file looks like it was added in the tip
// commit and git would report the deploy date for all of them. Generating the
// map locally (where the full history exists) and committing the result gives
// the build real dates without trusting the CI checkout.
//
// Runs as part of `npm run build`. Refuses to write from a shallow checkout so
// a CI run can never overwrite good data with deploy dates.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "_data", "gitdates.json");

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (e) {
    return "";
  }
}

if (git(["rev-parse", "--is-shallow-repository"]) !== "false") {
  console.log("[gitdates] shallow checkout, keeping the committed map as-is");
  process.exit(0);
}

// Every tracked source that can back a sitemap URL: page templates, blog
// posts, and the root HTML pages that are passed through verbatim.
const tracked = git(["ls-files", "src/*.njk", "src/blog/*.md", "*.html"])
  .split("\n")
  .filter(Boolean);

if (!tracked.length) {
  console.error("[gitdates] no tracked sources found, refusing to write an empty map");
  process.exit(1);
}

// One `git log` per file is slow enough to notice at ~70 files, so read the
// whole history once and keep the first (newest) date seen per path.
const dates = {};
const log = git(["log", "--name-only", "--format=%n%cs", "--", ...tracked]);
let current = "";
for (const line of log.split("\n")) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(line)) {
    current = line;
  } else if (line && current && !(line in dates)) {
    dates[line] = current;
  }
}

const sorted = Object.fromEntries(Object.keys(dates).sort().map((k) => [k, dates[k]]));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
console.log(`[gitdates] wrote ${Object.keys(sorted).length} entries to src/_data/gitdates.json`);
