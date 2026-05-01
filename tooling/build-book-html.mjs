#!/usr/bin/env node
/**
 * Build per-chapter HTML pages from docs/book/ using pandoc, with
 * prev/next/home navigation injected at the top + bottom of each page.
 *
 * Replaces the inline `find docs/book … pandoc` loop that lived in
 * .github/workflows/book.yml. Order matters — we need to know each
 * chapter's position to compute prev/next, which `find` doesn't give us.
 *
 * Output: apps/web/public/book/<path>.html mirroring docs/book/.
 *
 * Usage:
 *   node tooling/build-book-html.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(_dir, "..");
const BOOK_ROOT = path.join(REPO, "docs/book");
const OUT_ROOT = path.join(REPO, "apps/web/public/book");
const LUA_FILTER = path.join(REPO, "docs/book/md-to-html-links.lua");

if (!fs.existsSync(BOOK_ROOT)) {
    console.error(`build-book-html: ${BOOK_ROOT} not found`);
    process.exit(1);
}
if (!fs.existsSync(LUA_FILTER)) {
    console.error(`build-book-html: ${LUA_FILTER} not found`);
    process.exit(1);
}

function read(p) { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }
function titleFromMd(s) { const m = s?.match(/^#\s+(.+)$/m); return m ? m[1].trim() : null; }
function titleFromName(n) {
    return n.replace(/^\d+-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Build the ordered chapter list. Order = root index, then for each
// numbered section dir: section index, then alpha-sorted pages.
const chapters = [];

const rootMd = path.join(BOOK_ROOT, "index.md");
if (fs.existsSync(rootMd)) {
    chapters.push({
        mdPath: rootMd,
        outPath: path.join(OUT_ROOT, "index.html"),
        href: "/book/index.html",
        title: titleFromMd(read(rootMd)) ?? "Introduction"
    });
}

const sectionDirs = fs.readdirSync(BOOK_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

for (const dir of sectionDirs) {
    const sectionPath = path.join(BOOK_ROOT, dir.name);
    const sectionIndex = path.join(sectionPath, "index.md");
    if (fs.existsSync(sectionIndex)) {
        chapters.push({
            mdPath: sectionIndex,
            outPath: path.join(OUT_ROOT, dir.name, "index.html"),
            href: `/book/${dir.name}/index.html`,
            title: titleFromMd(read(sectionIndex)) ?? titleFromName(dir.name)
        });
    }
    const pages = fs.readdirSync(sectionPath, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const page of pages) {
        const slug = page.name.replace(/\.md$/, "");
        chapters.push({
            mdPath: path.join(sectionPath, page.name),
            outPath: path.join(OUT_ROOT, dir.name, `${slug}.html`),
            href: `/book/${dir.name}/${slug}.html`,
            title: titleFromMd(read(path.join(sectionPath, page.name))) ?? titleFromName(slug)
        });
    }
}

// Wire prev/next pointers
for (let i = 0; i < chapters.length; i++) {
    chapters[i].prev = i > 0 ? chapters[i - 1] : null;
    chapters[i].next = i < chapters.length - 1 ? chapters[i + 1] : null;
}

// Shared <head> CSS — pandoc's standalone HTML otherwise has zero
// styling. Keep it small and self-contained.
const CSS = `<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 760px; margin: 0 auto; padding: 1.5rem;
         line-height: 1.65; color: #1a1a1a; background: #fff; }
  h1, h2, h3, h4 { line-height: 1.25; margin-top: 1.5em; }
  h1 { font-size: 1.8rem; }
  h2 { font-size: 1.4rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
  h3 { font-size: 1.15rem; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  pre { background: #f5f5f5; padding: 0.85rem; border-radius: 4px;
        overflow-x: auto; font-size: 0.85rem; line-height: 1.5; }
  code { background: #f5f5f5; padding: 0.1rem 0.35rem;
         border-radius: 3px; font-size: 0.88em;
         font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
  th, td { border: 1px solid #ddd; padding: 0.45rem 0.7rem; text-align: left; }
  th { background: #f8f8f8; }
  blockquote { border-left: 3px solid #2563eb; margin-left: 0;
               padding: 0.2rem 1rem; color: #555; background: #f9f9fb; }
  hr { border: none; border-top: 1px solid #eee; margin: 2rem 0; }
  .book-nav { display: flex; align-items: center; gap: 1rem;
              padding: 0.75rem 0; font-size: 0.9rem; }
  .book-nav-top    { border-bottom: 1px solid #eee; margin-bottom: 1.75rem; }
  .book-nav-bottom { border-top: 1px solid #eee; margin-top: 2.5rem; }
  .book-nav-home { font-weight: 600; }
  .book-nav-prev, .book-nav-next { color: #2563eb; }
  .book-nav-prev[hidden], .book-nav-next[hidden] { visibility: hidden; }
  .book-nav-spacer { flex: 1; }
</style>`;

function navHtml(chapter, position) {
    const homeLink = `<a href="/book" class="book-nav-home">📖 The Infernet Book</a>`;
    const prevLink = chapter.prev
        ? `<a href="${chapter.prev.href}" class="book-nav-prev">← ${escapeHtml(chapter.prev.title)}</a>`
        : `<span class="book-nav-prev" hidden></span>`;
    const nextLink = chapter.next
        ? `<a href="${chapter.next.href}" class="book-nav-next">${escapeHtml(chapter.next.title)} →</a>`
        : `<span class="book-nav-next" hidden></span>`;
    const cls = position === "top" ? "book-nav book-nav-top" : "book-nav book-nav-bottom";
    // Top nav: prev | home | next.   Bottom nav: prev | (spacer) | next.
    if (position === "top") {
        return `<nav class="${cls}">${prevLink}<span class="book-nav-spacer"></span>${homeLink}<span class="book-nav-spacer"></span>${nextLink}</nav>`;
    }
    return `<nav class="${cls}">${prevLink}<span class="book-nav-spacer"></span>${nextLink}</nav>`;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function pandoc(args) {
    return new Promise((resolve, reject) => {
        const child = spawn("pandoc", args, { stdio: ["ignore", "inherit", "inherit"] });
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`pandoc exited ${code}`)));
        child.on("error", reject);
    });
}

const tmpDir = fs.mkdtempSync("/tmp/book-build-");
const headInclude = path.join(tmpDir, "head.html");
fs.writeFileSync(headInclude, CSS);

let built = 0;
for (const chapter of chapters) {
    fs.mkdirSync(path.dirname(chapter.outPath), { recursive: true });

    const beforeFile = path.join(tmpDir, "before.html");
    const afterFile  = path.join(tmpDir, "after.html");
    fs.writeFileSync(beforeFile, navHtml(chapter, "top"));
    fs.writeFileSync(afterFile,  navHtml(chapter, "bottom"));

    await pandoc([
        chapter.mdPath,
        "--standalone",
        "--highlight-style=tango",
        "--metadata", `title=${chapter.title} · The Infernet Book`,
        "--resource-path", `${path.dirname(chapter.mdPath)}:${BOOK_ROOT}`,
        `--lua-filter=${LUA_FILTER}`,
        `--include-in-header=${headInclude}`,
        `--include-before-body=${beforeFile}`,
        `--include-after-body=${afterFile}`,
        "-o", chapter.outPath
    ]);
    built++;
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`build-book-html: built ${built} chapter pages with prev/next nav`);
