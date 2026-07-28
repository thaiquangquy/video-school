import Link from "next/link";
import type { LessonWithProgress, WatchStatus } from "@/lib/lessons";

function statusLabel(status: WatchStatus): string {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

function badgeClass(status: WatchStatus): string {
  if (status === "completed") return "badge badge-completed";
  if (status === "in_progress") return "badge badge-in-progress";
  return "badge";
}

export function LessonCard({ lesson }: { lesson: LessonWithProgress }) {
  const { status, positionSeconds, durationSeconds } = lesson.progress;
  const percent =
    status === "in_progress" && durationSeconds && durationSeconds > 0
      ? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100))
      : null;

  return (
    <Link href={`/watch/${lesson.id}`} className="card lesson-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{lesson.title}</div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {lesson.subject}
          </div>
        </div>
        <span className={badgeClass(status)} style={{ flexShrink: 0 }}>
          {status === "completed" && "✓ "}
          {statusLabel(status)}
          {percent !== null && ` ${percent}%`}
        </span>
      </div>
    </Link>
  );
}
