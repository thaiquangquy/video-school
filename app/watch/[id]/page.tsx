import Link from "next/link";
import { notFound } from "next/navigation";
import { getLessonById } from "@/lib/lessons";
import { VideoPlayer } from "@/components/VideoPlayer";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = getLessonById(id);

  if (!lesson) {
    notFound();
  }

  return (
    <div>
      <Link href="/library" className="muted" style={{ fontSize: "0.85rem" }}>
        &larr; Back to Library
      </Link>
      <h1 style={{ marginTop: 8, fontSize: "1.4rem" }}>{lesson.title}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        {lesson.subject}
      </p>
      <VideoPlayer lesson={lesson} />
    </div>
  );
}
