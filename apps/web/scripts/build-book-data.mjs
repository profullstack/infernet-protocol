#!/usr/bin/env node
/**
 * Walk docs/book/ and bake the table-of-contents into
 * apps/web/lib/book-data.json. Used by the /book landing page only.
 *
 * Chapter content is NOT included here — chapters are rendered to
 * static .html files by pandoc in .github/workflows/book.yml and
 * served straight out of apps/web/public/book/. This file only needs
 * titles and href targets so the landing page can list the TOC.
 *
 * Run automatically via `prebuild` and `predev` in package.json.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const BOOK_ROOT = path.resolve(_dir, "..", "..", "..", "docs", "book");
const OUT = path.resolve(_dir, "..", "lib", "book-data.json");

if (!fs.existsSync(BOOK_ROOT)) {
    console.error(`build-book-data: ${BOOK_ROOT} not found — writing empty toc.`);
    fs.writeFileSync(OUT, JSON.stringify({ toc: [] }, null, 2));
    process.exit(0);
}

function read(p) { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }
function titleFromMd(s) { const m = s?.match(/^#\s+(.+)$/m); return m ? m[1].trim() : null; }
function titleFromName(n) {
    return n.replace(/^\d+-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const toc = [];
const sectionDirs = fs.readdirSync(BOOK_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

for (const dir of sectionDirs) {
    const sectionSlug = dir.name;
    const sectionPath = path.join(BOOK_ROOT, sectionSlug);
    const sectionIndexMd = read(path.join(sectionPath, "index.md"));
    const sectionTitle = titleFromMd(sectionIndexMd) ?? titleFromName(sectionSlug);

    const pages = fs.readdirSync(sectionPath, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => {
            const slug = e.name.replace(/\.md$/, "");
            const title = titleFromMd(read(path.join(sectionPath, e.name))) ?? titleFromName(slug);
            return { slug, href: `/book/${sectionSlug}/${slug}.html`, title };
        });

    toc.push({
        slug: sectionSlug,
        href: `/book/${sectionSlug}/index.html`,
        title: sectionTitle,
        pages
    });
}

// Include the root index.md so the landing page can render the
// introduction inline for SEO (chapter content is otherwise served as
// static .html). Strip the leading H1 + inline cover img — already in the hero.
const rootMd = read(path.join(BOOK_ROOT, "index.md")) ?? "";
const intro = rootMd
    .replace(/^#[^\n]*\n+/, "")
    .replace(/^<img[^>]*\/>\s*\n+/, "");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ toc, intro }, null, 2));
console.log(`build-book-data: wrote ${OUT} — ${toc.length} sections, ${toc.reduce((a, s) => a + s.pages.length, 0)} pages, ${intro.length}B intro`);
