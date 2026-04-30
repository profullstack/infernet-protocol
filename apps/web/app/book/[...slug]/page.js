import { getChapter, getAllChapterSlugs } from "@/lib/book";
import BookChapter from "@/components/book-chapter";
import { notFound } from "next/navigation";

export const dynamic = "force-static";

export async function generateStaticParams() {
    return getAllChapterSlugs()
        .filter((s) => s.length > 0)
        .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const chapter = getChapter(slug);
    if (!chapter) return {};
    return { title: `${chapter.title} — The Infernet Book` };
}

export default async function BookChapterPage({ params }) {
    const { slug } = await params;
    const chapter = getChapter(slug);
    if (!chapter) notFound();
    return <BookChapter chapter={chapter} />;
}
