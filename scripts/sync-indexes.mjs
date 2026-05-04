#!/usr/bin/env node
// Regenerate <!-- auto:start ... --><!-- auto:end --> blocks inside
// src/content/blog/*-index.md. Runs as `prebuild` so the build never ships a
// stale index. Bytes outside the markers are immutable.
//
// Marker grammar:
//   <!-- auto:start category=<cat> [type=<tag>] [tech=<tag>] [filename-prefix=<p>[,<p>...]] [sort=<o>] -->
//   ...auto-managed list...
//   <!-- auto:end -->
//
// Required: category=<one of CATEGORIES>
// Optional filters (all AND-combined):
//   type=<a-tag>             entry's tags array contains this Type-dimension tag
//   tech=<a-tag>             entry's tags array contains this Tech-dimension tag
//   filename-prefix=a,b,c    entry's slug startsWith one of the comma-separated values
// Optional sort:
//   sort=pubDate-desc | pubDate-asc | title    (default: pubDate-desc)
//
// Always excluded from listings:
//   - draft: true
//   - the index file itself (any *-index.md)

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const BLOG_DIR = "src/content/blog";
const MARKER_RE =
  /<!--\s*auto:start\s+([^>]+?)\s*-->[\s\S]*?<!--\s*auto:end\s*-->/g;

function parseAttrs(attrsStr) {
  const out = {};
  for (const m of attrsStr.matchAll(/([\w-]+)=([^\s"]+|"[^"]*")/g)) {
    out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

function loadPosts() {
  const files = readdirSync(BLOG_DIR).filter(
    (f) => f.endsWith(".md") && !f.startsWith("._"),
  );
  return files.map((f) => {
    const raw = readFileSync(join(BLOG_DIR, f), "utf8");
    const { data } = matter(raw);
    return {
      slug: f.replace(/\.md$/, ""),
      data,
      raw,
    };
  });
}

function entryFilter(post, attrs) {
  if (post.data.draft === true) return false;
  if (post.slug.endsWith("-index")) return false;
  if (post.data.category !== attrs.category) return false;
  const tags = post.data.tags || [];
  if (attrs.type && !tags.includes(attrs.type)) return false;
  if (attrs.tech && !tags.includes(attrs.tech)) return false;
  if (attrs["filename-prefix"]) {
    const prefixes = attrs["filename-prefix"].split(",").map((s) => s.trim());
    if (!prefixes.some((p) => post.slug.startsWith(p))) return false;
  }
  return true;
}

function sortEntries(entries, sort) {
  const order = sort || "pubDate-desc";
  const cmp = {
    "pubDate-desc": (a, b) =>
      new Date(b.data.pubDate) - new Date(a.data.pubDate),
    "pubDate-asc": (a, b) =>
      new Date(a.data.pubDate) - new Date(b.data.pubDate),
    title: (a, b) => String(a.data.title).localeCompare(String(b.data.title)),
  }[order];
  if (!cmp) throw new Error(`unknown sort=${order}`);
  return [...entries].sort(cmp);
}

const posts = loadPosts();
const indexes = posts.filter((p) => p.slug.endsWith("-index"));

let modified = 0;
let totalEntries = 0;
const summary = [];

for (const idx of indexes) {
  let blockCount = 0;
  let entryCount = 0;
  const newContent = idx.raw.replace(MARKER_RE, (_match, attrsStr) => {
    blockCount++;
    const attrs = parseAttrs(attrsStr);
    if (!attrs.category) {
      throw new Error(`[sync-indexes] ${idx.slug}.md: marker missing category=`);
    }
    const filtered = posts.filter((p) => entryFilter(p, attrs));
    const sorted = sortEntries(filtered, attrs.sort);
    entryCount += sorted.length;
    const lines = sorted.map(
      (p) => `- [${p.data.title}](${p.slug}/)`,
    );
    const body = lines.length ? `\n${lines.join("\n")}\n` : "\n";
    return `<!-- auto:start ${attrsStr} -->${body}<!-- auto:end -->`;
  });

  if (blockCount === 0) {
    summary.push(`  ${idx.slug}.md  (no markers, skipped)`);
    continue;
  }

  totalEntries += entryCount;
  if (newContent !== idx.raw) {
    writeFileSync(join(BLOG_DIR, idx.slug + ".md"), newContent);
    modified++;
    summary.push(
      `  ${idx.slug}.md  blocks=${blockCount} entries=${entryCount} (changed)`,
    );
  } else {
    summary.push(
      `  ${idx.slug}.md  blocks=${blockCount} entries=${entryCount} (unchanged)`,
    );
  }
}

console.log(`[sync-indexes] scanned ${indexes.length} index file(s):`);
for (const line of summary) console.log(line);
console.log(
  `[sync-indexes] ${modified} file(s) regenerated, ${totalEntries} total entries`,
);
