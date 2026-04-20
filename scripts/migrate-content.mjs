#!/usr/bin/env node
/**
 * Idempotent content migration script for Phase 02-01.
 *
 * Walks legacy `content/` tree, parses frontmatter with gray-matter, derives
 * any missing required fields to satisfy the Zod schema in
 * `src/content.config.ts` (title, description, pubDate, category, tags, draft),
 * transforms Obsidian-flavored syntax (wikilinks, Smart Columns) to standard
 * Markdown, writes each note flat into `src/content/blog/`, and copies
 * `content/assets/**` verbatim into `public/assets/**`.
 *
 * Safe to run multiple times — always rewrites destination files from source.
 *
 * Contract (from 02-01-PLAN.md):
 *   - Image wikilinks:    ![[foo.png]]             → ![](/ai-study-note/assets/foo.png)
 *   - Labeled wikilinks:  [[path/to/note|Label]]    → Label
 *   - Bare wikilinks:     [[path/to/note-name]]     → note-name
 *   - Smart Columns:      :::col{...} ... :::       → body preserved, fence lines removed
 *   - pubDate:            git log first-commit author-date; fallback = today
 *   - category:           top-level directory under content/, lowercased
 *   - Flat destination:   src/content/blog/<basename>.md
 *                         Collision → <category>-<basename>.md
 *                         Second collision → <category>-<parent>-<basename>.md
 *   - Skips: content/assets/**, .obsidian/**, ._* (macOS resource forks), non-.md
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import matter from "gray-matter";

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.resolve(PROJECT_ROOT, "content");
const DEST_ROOT = path.resolve(PROJECT_ROOT, "src/content/blog");
const ASSET_SRC = path.resolve(PROJECT_ROOT, "content/assets");
const ASSET_DEST = path.resolve(PROJECT_ROOT, "public/assets");
const ASSET_URL_PREFIX = "/ai-study-note/assets/";

const stats = {
  scanned: 0,
  migrated: 0,
  collisions: [], // { basename, chosen, reason }
  imageWikilinks: 0,
  labeledWikilinks: 0,
  bareWikilinks: 0,
  smartColFences: 0,
  assetsCopied: 0,
  fallbackDates: 0,
  errors: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanize(basenameNoExt) {
  return basenameNoExt
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function firstParagraph(body) {
  // Return first non-heading, non-blank, non-list, non-table, non-quote,
  // non-fenced-code line block collapsed to a single line.
  const lines = body.split(/\r?\n/);
  let inFence = false;
  const stopStartChars = new Set(["#", "-", "*", ">", "!", ":", "|"]);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (stopStartChars.has(line[0])) continue;
    // Found a paragraph line — collapse trailing paragraph continuation
    let trimmed = line.replace(/\s+/g, " ");
    if (trimmed.length > 160) {
      trimmed = trimmed.slice(0, 157).trimEnd() + "...";
    }
    return trimmed;
  }
  return null;
}

function gitAddDateISO(absPath) {
  // Returns YYYY-MM-DD of first commit that added the file, or null on error.
  try {
    const rel = path.relative(PROJECT_ROOT, absPath);
    const out = execSync(
      `git log --diff-filter=A --format=%aI -- ${JSON.stringify(rel)}`,
      { stdio: ["ignore", "pipe", "ignore"], cwd: PROJECT_ROOT },
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    if (out.length === 0) return null;
    const isoDate = out[out.length - 1]; // last line = earliest commit
    if (!isoDate) return null;
    return isoDate.slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Split body into segments that alternate between "prose" (where wikilinks
 * should be transformed) and "code" (fenced blocks + inline code spans, where
 * we must NOT touch [[...]] because JSON/array literals collide with the
 * wikilink syntax, e.g. --values-json '[["x","y","z"]]').
 *
 * Fenced code blocks: lines that start with ``` (any backtick run >=3).
 * Inline code spans: text between matching backtick runs on the same line.
 */
function segmentByCode(body) {
  const lines = body.split("\n");
  const segments = []; // { type: "prose"|"code", text }
  let buf = [];
  let inFence = false;
  let fenceMarker = null;
  const flushProse = () => {
    if (buf.length === 0) return;
    segments.push({ type: "prose", text: buf.join("\n") });
    buf = [];
  };
  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!inFence) {
        // Opening fence — flush prose, start code segment with the fence line.
        flushProse();
        inFence = true;
        fenceMarker = marker[0]; // backtick or tilde char
        segments.push({ type: "code", text: line });
      } else if (marker[0] === fenceMarker) {
        // Closing fence — append to the last code segment, then end it.
        const last = segments[segments.length - 1];
        last.text += "\n" + line;
        inFence = false;
        fenceMarker = null;
      } else {
        // Different fence char inside a fence: treat as content.
        segments[segments.length - 1].text += "\n" + line;
      }
      continue;
    }
    if (inFence) {
      segments[segments.length - 1].text += "\n" + line;
    } else {
      buf.push(line);
    }
  }
  flushProse();
  return segments;
}

/**
 * Protect inline code spans (`...`) inside a prose segment by replacing them
 * with placeholders, running the transform, and restoring originals.
 * Handles single and multi-backtick spans.
 */
function withInlineCodeProtected(text, transform) {
  const spans = [];
  const placeholder = (i) => `\u0000CODE_SPAN_${i}\u0000`;
  // Match inline code spans: runs of N backticks, non-greedy up to matching N backticks.
  // Using a simple tick-pair approach — handles `foo`, ``foo`bar``, etc.
  const protectedText = text.replace(/(`+)([\s\S]*?)\1/g, (m) => {
    const idx = spans.length;
    spans.push(m);
    return placeholder(idx);
  });
  let out = transform(protectedText);
  for (let i = 0; i < spans.length; i++) {
    out = out.replace(placeholder(i), () => spans[i]);
  }
  return out;
}

function stripObsidianSyntax(body) {
  // First split body into prose/code segments. Only transform prose.
  const segments = segmentByCode(body);

  const transformProse = (proseText) => {
    return withInlineCodeProtected(proseText, (safe) => {
      let out = safe;

      // a. Image wikilinks:  ![[path/to/foo.png]]
      out = out.replace(/!\[\[([^\]]+?)\]\]/g, (_m, captured) => {
        stats.imageWikilinks++;
        return `![](${ASSET_URL_PREFIX}${captured})`;
      });

      // b. Labeled wikilinks:  [[target|Label text]]
      out = out.replace(
        /\[\[([^\]|]+?)\|([^\]]+?)\]\]/g,
        (_m, _target, label) => {
          stats.labeledWikilinks++;
          return label;
        },
      );

      // c. Bare wikilinks:  [[path/or/name]]
      out = out.replace(/\[\[([^\]]+?)\]\]/g, (_m, captured) => {
        stats.bareWikilinks++;
        const segs = captured.split("/");
        return segs[segs.length - 1];
      });

      return out;
    });
  };

  const rebuilt = segments
    .map((s) => (s.type === "prose" ? transformProse(s.text) : s.text))
    .join("\n");

  // d. Smart Columns: remove fence lines only, keep body.
  // Done AFTER prose/code split so :::col inside code blocks is left alone too.
  const lines = rebuilt.split("\n");
  const kept = [];
  let inCodeFenceForSmartCol = false;
  let smartColFence = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!inCodeFenceForSmartCol) {
        inCodeFenceForSmartCol = true;
        smartColFence = marker[0];
      } else if (marker[0] === smartColFence) {
        inCodeFenceForSmartCol = false;
        smartColFence = null;
      }
      kept.push(line);
      continue;
    }
    if (!inCodeFenceForSmartCol) {
      const trimmed = line.trim();
      if (/^:::col(\b|\{|$)/.test(trimmed)) {
        stats.smartColFences++;
        continue;
      }
      if (/^:::$/.test(trimmed)) {
        stats.smartColFences++;
        continue;
      }
    }
    kept.push(line);
  }

  return kept.join("\n");
}

function collectSourceFiles() {
  // Node 22's readdirSync supports { recursive: true, withFileTypes: true }.
  const entries = fs.readdirSync(SRC_ROOT, {
    recursive: true,
    withFileTypes: true,
  });
  const files = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    // Skip macOS resource forks and hidden files.
    if (e.name.startsWith(".") || e.name.startsWith("._")) continue;
    if (!e.name.toLowerCase().endsWith(".md")) continue;
    // e.parentPath is available on Node 22 for recursive readdir.
    const parent = e.parentPath ?? e.path ?? SRC_ROOT;
    const abs = path.join(parent, e.name);
    const rel = path.relative(SRC_ROOT, abs);
    if (rel.split(path.sep).some((s) => s === ".obsidian")) continue;
    if (rel.split(path.sep)[0] === "assets") continue;
    files.push({ absPath: abs, relPath: rel, basename: e.name });
  }
  // Deterministic order so idempotent runs produce identical outputs / collision
  // resolutions. Shallower paths come first so the canonical index.md for a
  // category claims `<category>-index.md` before deeper nested index files.
  files.sort((a, b) => {
    const depthA = a.relPath.split(path.sep).length;
    const depthB = b.relPath.split(path.sep).length;
    if (depthA !== depthB) return depthA - depthB;
    return a.relPath.localeCompare(b.relPath);
  });
  return files;
}

function chooseDestName(basename, topCategory, parentDir, claimed) {
  // Primary: <basename>
  if (!claimed.has(basename)) return { name: basename, reason: "primary" };

  // Collision #1: <topCategory>-<basename>
  const c1 = `${topCategory}-${basename}`;
  if (!claimed.has(c1)) {
    stats.collisions.push({ basename, chosen: c1, reason: "category-prefix" });
    return { name: c1, reason: "category-prefix" };
  }

  // Collision #2: <topCategory>-<parentDir>-<basename>
  const c2 = parentDir ? `${topCategory}-${parentDir}-${basename}` : null;
  if (c2 && !claimed.has(c2)) {
    stats.collisions.push({
      basename,
      chosen: c2,
      reason: "category-parent-prefix",
    });
    return { name: c2, reason: "category-parent-prefix" };
  }

  // Should not happen with current content; last-resort numeric suffix.
  let i = 2;
  while (true) {
    const base = basename.replace(/\.md$/i, "");
    const cN = `${topCategory}-${base}-${i}.md`;
    if (!claimed.has(cN)) {
      stats.collisions.push({
        basename,
        chosen: cN,
        reason: `numeric-suffix-${i}`,
      });
      return { name: cN, reason: `numeric-suffix-${i}` };
    }
    i++;
    if (i > 100) {
      throw new Error(
        `Could not resolve collision for basename=${basename} after 100 attempts`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function migrate() {
  if (!fs.existsSync(SRC_ROOT)) {
    console.error(`Source ${SRC_ROOT} does not exist — nothing to migrate.`);
    process.exit(1);
  }
  fs.mkdirSync(DEST_ROOT, { recursive: true });

  const files = collectSourceFiles();
  stats.scanned = files.length;
  const claimed = new Set();

  for (const f of files) {
    try {
      const raw = fs.readFileSync(f.absPath, "utf8");
      const parsed = matter(raw);
      const fm = parsed.data ?? {};
      const body = parsed.content ?? "";

      const parts = f.relPath.split(path.sep);
      const topCategory =
        parts.length > 1 ? parts[0].toLowerCase() : "index";
      const parentDir =
        parts.length > 2 ? parts[parts.length - 2].toLowerCase() : null;

      const baseNoExt = f.basename.replace(/\.md$/i, "");

      // Derive title
      const title =
        typeof fm.title === "string" && fm.title.trim().length > 0
          ? fm.title
          : humanize(baseNoExt);

      // Derive description
      let description;
      if (typeof fm.description === "string" && fm.description.trim().length > 0) {
        description = fm.description;
      } else {
        description = firstParagraph(body) ?? title;
      }

      // Derive pubDate
      let pubDate;
      if (fm.pubDate) {
        // gray-matter may give a Date object if the YAML value was an unquoted ISO;
        // normalize to YYYY-MM-DD string for deterministic serialization.
        if (fm.pubDate instanceof Date && !Number.isNaN(fm.pubDate.getTime())) {
          pubDate = fm.pubDate.toISOString().slice(0, 10);
        } else if (typeof fm.pubDate === "string" && fm.pubDate.trim()) {
          pubDate = fm.pubDate.trim();
        } else {
          pubDate = gitAddDateISO(f.absPath);
          if (!pubDate) {
            pubDate = todayYMD();
            stats.fallbackDates++;
          }
        }
      } else {
        pubDate = gitAddDateISO(f.absPath);
        if (!pubDate) {
          pubDate = todayYMD();
          stats.fallbackDates++;
        }
      }

      // Derive category
      const category = topCategory;

      // Derive tags
      let tags;
      if (Array.isArray(fm.tags)) tags = fm.tags.map(String);
      else if (typeof fm.tags === "string" && fm.tags.trim()) tags = [fm.tags.trim()];
      else tags = [];

      // Derive draft
      const draft = fm.draft === true;

      // Strict frontmatter field ordering: title, description, pubDate, category, tags, draft
      const newFm = {
        title,
        description,
        pubDate,
        category,
        tags,
        draft,
      };

      const transformedBody = stripObsidianSyntax(body);

      const choice = chooseDestName(
        f.basename,
        topCategory,
        parentDir,
        claimed,
      );
      claimed.add(choice.name);

      const outPath = path.join(DEST_ROOT, choice.name);
      const serialized = matter.stringify(transformedBody, newFm);

      if (!serialized || serialized.length === 0) {
        throw new Error(`gray-matter stringify produced empty output for ${f.relPath}`);
      }

      fs.writeFileSync(outPath, serialized, "utf8");
      stats.migrated++;
    } catch (err) {
      stats.errors.push({ file: f.relPath, message: err.message });
      console.error(`[ERROR] ${f.relPath}: ${err.message}`);
    }
  }

  // Copy assets ---------------------------------------------------------------
  if (fs.existsSync(ASSET_SRC)) {
    fs.mkdirSync(ASSET_DEST, { recursive: true });
    fs.cpSync(ASSET_SRC, ASSET_DEST, {
      recursive: true,
      force: true,
      filter: (src) => {
        const base = path.basename(src);
        if (base.startsWith("._")) return false; // macOS resource forks
        if (base === ".DS_Store") return false;
        return true;
      },
    });
    // Count copied files (post-copy, filtered already applied to destination).
    const walk = (dir) => {
      let n = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) n += walk(p);
        else if (entry.isFile() && !entry.name.startsWith("._")) n++;
      }
      return n;
    };
    stats.assetsCopied = walk(ASSET_DEST);
  }

  // Report --------------------------------------------------------------------
  const totalWikilinks =
    stats.imageWikilinks + stats.labeledWikilinks + stats.bareWikilinks;
  console.log("Migration complete:");
  console.log(`  Files scanned:       ${stats.scanned}`);
  console.log(`  Files migrated:      ${stats.migrated}`);
  console.log(`  Basename collisions: ${stats.collisions.length}`);
  for (const c of stats.collisions) {
    console.log(`    - ${c.basename} → ${c.chosen} (${c.reason})`);
  }
  console.log(`  Wikilinks stripped:  ${totalWikilinks}`);
  console.log(`    image:   ${stats.imageWikilinks}`);
  console.log(`    labeled: ${stats.labeledWikilinks}`);
  console.log(`    bare:    ${stats.bareWikilinks}`);
  console.log(`  Smart Column fences: ${stats.smartColFences}`);
  console.log(`  Assets copied:       ${stats.assetsCopied}`);
  console.log(`  Fallback-today dates: ${stats.fallbackDates}`);
  console.log(`  Errors:              ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.error("\nErrors encountered:");
    for (const e of stats.errors) console.error(`  - ${e.file}: ${e.message}`);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
