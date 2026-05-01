#!/usr/bin/env node
/**
 * Walk docs/book/ and bake every chapter into apps/web/lib/book-data.json.
 *
 * This file is imported by lib/book.js so the deployed Next.js bundle
 * never has to read docs/book/ at runtime — Railway's build context
 * doesn't reliably include the monorepo's docs/ tree, so relative
 * filesystem reads from apps/web/lib/ were silently returning empty.
 *
 * Run automatically via `prebuild` and `predev` in apps/web/package.json.
 * Safe to commit the resulting JSON; it's regenerated on every build.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const _dir = path.dirname(fileURLToPath(import.meta.url));
const BOOK_ROOT = path.resolve(_dir, "..", "..", "..", "docs", "book");
const OUT = path.resolve(_dir, "..", "lib", "book-data.json");

if (!fs.existsSync(BOOK_ROOT)) {
    console.error(`build-book-data: ${BOOK_ROOT} not found — writing empty data.`);
    fs.writeFileSync(OUT, JSON.stringify({ toc: [], chapters: {} }, null, 2));
    process.exit(0);
}

function read(p) { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }
function titleFromMd(s) { const m = s?.match(/^#\s+(.+)$/m); return m ? m[1].trim() : null; }
function titleFromName(n) {
    return n.replace(/^\d+-/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const toc = [];
const chapters = {}; // key: "slug/path" or "" for root → { content, title, sectionTitle }

// Root index → key ""
const rootMd = read(path.join(BOOK_ROOT, "index.md"));
if (rootMd) chapters[""] = { content: rootMd, title: "Introduction", sectionTitle: null };

const sectionDirs = fs.readdirSync(BOOK_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

for (const dir of sectionDirs) {
    const sectionSlug = dir.name;
    const sectionPath = path.join(BOOK_ROOT, sectionSlug);
    const sectionIndexMd = read(path.join(sectionPath, "index.md"));
    const sectionTitle = titleFromMd(sectionIndexMd) ?? titleFromName(sectionSlug);

    // Section index page
    if (sectionIndexMd) {
        chapters[sectionSlug] = {
            content: sectionIndexMd,
            title: sectionTitle,
            sectionTitle
        };
    }

    const pages = fs.readdirSync(sectionPath, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => {
            const slug = e.name.replace(/\.md$/, "");
            const content = read(path.join(sectionPath, e.name));
            const title = titleFromMd(content) ?? titleFromName(slug);
            const key = `${sectionSlug}/${slug}`;
            chapters[key] = { content, title, sectionTitle };
            return { slug, href: `/book/${sectionSlug}/${slug}`, title };
        });

    toc.push({
        slug: sectionSlug,
        href: `/book/${sectionSlug}`,
        title: sectionTitle,
        pages
    });
}

// Compute prev/next across the flat reading order
const flat = [
    { href: "/book", title: "Introduction", key: "" },
    ...toc.flatMap((s) => [
        { href: s.href, title: s.title, key: s.slug },
        ...s.pages.map((p) => ({ href: p.href, title: p.title, key: `${s.slug}/${p.slug}` }))
    ])
];

for (let i = 0; i < flat.length; i += 1) {
    const item = flat[i];
    const ch = chapters[item.key];
    if (!ch) continue;
    ch.prev = i > 0 ? { href: flat[i - 1].href, title: flat[i - 1].title } : null;
    ch.next = i < flat.length - 1 ? { href: flat[i + 1].href, title: flat[i + 1].title } : null;
}

const data = { toc, chapters };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(`build-book-data: wrote ${OUT} — ${toc.length} sections, ${Object.keys(chapters).length} chapters`);
