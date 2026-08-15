import Link from "next/link";
import { getAllLessons, getContinueLearning } from "@/lib/lessons";
import { LessonCard } from "@/components/LessonCard";

// Reads live watch-progress state on every request — never statically
// prerender (the DB also doesn't exist yet at `next build` time; schema
// init happens in instrumentation.ts when the server actually starts).
export const dynamic = "force-dynamic";

const UP_NEXT_FETCH_COUNT = 4;

export default async function Home() {
  const allLessons = await getAllLessons();
  const { continueLearning, upNext } = await getContinueLearning(undefined, UP_NEXT_FETCH_COUNT);

  const startHere = !continueLearning ? (upNext[0] ?? null) : null;
  const upNextDisplay = continueLearning ? upNext.slice(0, 3) : upNext.slice(1, 4);

  const percent =
    continueLearning?.progress.durationSeconds && continueLearning.progress.durationSeconds > 0
      ? Math.min(
          100,
          Math.round((continueLearning.progress.positionSeconds / continueLearning.progress.durationSeconds) * 100),
        )
      : null;

  return (
    <div>
      {continueLearning ? (
        <div className="card" style={{ padding: 28 }}>
          <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
            Continue Learning
          </div>
          <h1 style={{ fontSize: "1.6rem", marginBottom: 4 }}>{continueLearning.title}</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            {continueLearning.subject}
          </p>
          {percent !== null && (
            <div style={{ marginBottom: 18, maxWidth: 320 }}>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
                {percent}% watched
              </div>
            </div>
          )}
          <Link href={`/watch/${continueLearning.id}`} className="btn btn-primary">
            Resume
          </Link>
        </div>
      ) : startHere ? (
        <div className="card" style={{ padding: 28 }}>
          <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
            Start Here
          </div>
          <h1 style={{ fontSize: "1.6rem", marginBottom: 4 }}>{startHere.title}</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            {startHere.subject}
          </p>
          <Link href={`/watch/${startHere.id}`} className="btn btn-primary">
            Start Watching
          </Link>
        </div>
      ) : (
        <div className="card empty-state">
          {allLessons.length === 0
            ? "No lessons yet — add some to data/lessons.yaml to get started."
            : "All caught up! Every lesson has been completed."}
        </div>
      )}

      {upNextDisplay.length > 0 && (
        <>
          <div className="section-title">Up Next</div>
          <div className="grid grid-3">
            {upNextDisplay.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
