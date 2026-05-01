/**
 * Book data accessor — reads from the pre-baked book-data.json that
 * `scripts/build-book-data.mjs` writes during prebuild.
 *
 * No filesystem walks at runtime; all reads come from the bundled JSON.
 * Railway / serverless builds don't reliably ship the monorepo's docs/
 * tree, so the previous fs-walk version returned empty TOCs in prod.
 */

import data from "./book-data.json" with { type: "json" };

export function getBookToc() {
    return data.toc ?? [];
}

/**
 * Return { content, title, sectionTitle, prev, next } for a slug path,
 * or null if the chapter doesn't exist.
 */
export function getChapter(slugParts) {
    const key = !slugParts || slugParts.length === 0 ? "" : slugParts.join("/");
    const ch = data.chapters?.[key];
    if (!ch) return null;
    return {
        content: ch.content,
        title: ch.title,
        sectionTitle: ch.sectionTitle ?? null,
        prev: ch.prev ?? null,
        next: ch.next ?? null
    };
}

export function getAllChapterSlugs() {
    return Object.keys(data.chapters ?? {}).map((key) => key === "" ? [] : key.split("/"));
}
