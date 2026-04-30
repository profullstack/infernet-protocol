import { getChapter } from "@/lib/book";
import BookChapter from "@/components/book-chapter";
import { notFound } from "next/navigation";

export const dynamic = "force-static";

export default function BookIndexPage() {
    const chapter = getChapter([]);
    if (!chapter) notFound();
    return <BookChapter chapter={chapter} />;
}
