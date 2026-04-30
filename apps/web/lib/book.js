import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const _dir = path.dirname(fileURLToPath(import.meta.url));
// Navigate from apps/web/lib/ up to repo root, then into docs/book
const BOOK_ROOT = path.join(_dir, "..", "..", "..", "docs", "book");

function safeRead(filePath) {
    try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
}

function titleFromFilename(name) {
    return name
        .replace(/^\d+-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function titleFromMarkdown(content) {
    const m = content?.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : null;
}

/** Build the full chapter tree from the book directory. */
export function getBookToc() {
    if (!fs.existsSync(BOOK_ROOT)) return [];

    const entries = fs.readdirSync(BOOK_ROOT, { withFileTypes: true })
        .filter((e) => e.name !== "index.md")
        .sort((a, b) => a.name.localeCompare(b.name));

    const sections = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sectionSlug = entry.name;
        const sectionPath = path.join(BOOK_ROOT, sectionSlug);
        const sectionIndex = safeRead(path.join(sectionPath, "index.md"));
        const sectionTitle = titleFromMarkdown(sectionIndex) ?? titleFromFilename(sectionSlug);

        const pages = fs.readdirSync(sectionPath, { withFileTypes: true })
            .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "index.md")
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => {
                const slug = e.name.replace(/\.md$/, "");
                const content = safeRead(path.join(sectionPath, e.name));
                return {
                    slug,
                    href: `/book/${sectionSlug}/${slug}`,
                    title: titleFromMarkdown(content) ?? titleFromFilename(slug)
                };
            });

        sections.push({
            slug: sectionSlug,
            href: `/book/${sectionSlug}`,
            title: sectionTitle,
            pages
        });
    }

    return sections;
}

/** Return { content, title, section, prev, next } for a slug path. */
export function getChapter(slugParts) {
    const toc = getBookToc();

    let filePath, title, sectionTitle;

    if (!slugParts || slugParts.length === 0) {
        filePath = path.join(BOOK_ROOT, "index.md");
        title = "Introduction";
    } else if (slugParts.length === 1) {
        const sectionSlug = slugParts[0];
        filePath = path.join(BOOK_ROOT, sectionSlug, "index.md");
        const section = toc.find((s) => s.slug === sectionSlug);
        title = section?.title ?? titleFromFilename(sectionSlug);
        sectionTitle = title;
    } else {
        const [sectionSlug, pageSlug] = slugParts;
        filePath = path.join(BOOK_ROOT, sectionSlug, `${pageSlug}.md`);
        const section = toc.find((s) => s.slug === sectionSlug);
        sectionTitle = section?.title;
        const page = section?.pages.find((p) => p.slug === pageSlug);
        title = page?.title ?? titleFromFilename(pageSlug);
    }

    const content = safeRead(filePath);
    if (!content) return null;

    // Build flat page list for prev/next
    const flat = [
        { href: "/book", title: "Introduction" },
        ...toc.flatMap((s) => [
            { href: s.href, title: s.title },
            ...s.pages
        ])
    ];
    const currentHref = slugParts?.length
        ? `/book/${slugParts.join("/")}`
        : "/book";
    const idx = flat.findIndex((p) => p.href === currentHref);

    return {
        content,
        title,
        sectionTitle,
        prev: idx > 0 ? flat[idx - 1] : null,
        next: idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null
    };
}

export function getAllChapterSlugs() {
    const toc = getBookToc();
    const slugs = [[]]; // root index
    for (const section of toc) {
        slugs.push([section.slug]);
        for (const page of section.pages) {
            slugs.push([section.slug, page.slug]);
        }
    }
    return slugs;
}
