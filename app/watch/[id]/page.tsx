import Link from "next/link";
import { notFound } from "next/navigation";
import { getLessonById } from "@/lib/lessons";
import { readConfig } from "@/lib/config";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ResetProgressButton } from "@/components/ResetProgressButton";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await getLessonById(id);

  if (!lesson) {
    notFound();
  }

  const { driveFolderUrl } = readConfig();

  return (
    <div>
      <Link href="/library" className="muted" style={{ fontSize: "0.85rem" }}>
        &larr; Back to Library
      </Link>
      <h1 style={{ marginTop: 8, fontSize: "1.4rem" }}>{lesson.title}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        {lesson.subject}
      </p>
      <VideoPlayer lesson={lesson} driveFolderUrl={driveFolderUrl} />
      {lesson.progress.status !== "not_started" && <ResetProgressButton lessonId={lesson.id} />}
    </div>
  );
}
