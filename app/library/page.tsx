import { getEnrolledLessons, getCatalog, type LessonWithProgress } from "@/lib/lessons";
import { SUPPORTS_ENROLLMENT } from "@/lib/backend";
import { LessonCard } from "@/components/LessonCard";
import { CatalogLessonCard } from "@/components/CatalogLessonCard";

export const dynamic = "force-dynamic";

function groupBySubject(lessons: LessonWithProgress[]): Map<string, LessonWithProgress[]> {
  const bySubject = new Map<string, LessonWithProgress[]>();
  for (const lesson of lessons) {
    const list = bySubject.get(lesson.subject) ?? [];
    list.push(lesson);
    bySubject.set(lesson.subject, list);
  }
  return bySubject;
}

export default async function LibraryPage() {
  // getEnrolledLessons() already dispatches correctly per backend: "all
  // lessons" locally, "my enrolled lessons" in cloud mode — no page-level
  // branching needed here.
  const lessons = await getEnrolledLessons();
  const bySubject = groupBySubject(lessons);

  // Catalog browsing + enroll/unenroll only exists in cloud mode. Skip the
  // fetch entirely in local mode rather than calling the harmless stub —
  // no reason to, and it keeps local mode's data path unchanged.
  const catalog = SUPPORTS_ENROLLMENT ? await getCatalog() : null;
  const catalogBySubject = catalog ? groupBySubject(catalog) : null;

  return (
    <div>
      <h1 style={{ marginBottom: 20, fontSize: "1.4rem" }}>Library</h1>

      {lessons.length === 0 && (
        <div className="card empty-state">No lessons yet — add some to data/lessons.yaml to get started.</div>
      )}

      {[...bySubject.entries()].map(([subject, subjectLessons]) => (
        <div key={subject}>
          <div className="section-title">{subject}</div>
          <div className="grid grid-3">
            {subjectLessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        </div>
      ))}

      {catalogBySubject && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 4 }}>Browse all lessons</h2>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
            Enroll in a lesson to start tracking your progress on it.
          </p>

          {catalog && catalog.length === 0 && (
            <div className="card empty-state">No lessons in the catalog yet.</div>
          )}

          {[...catalogBySubject.entries()].map(([subject, subjectLessons]) => (
            <div key={subject}>
              <div className="section-title">{subject}</div>
              <div className="grid grid-3">
                {subjectLessons.map((lesson) => (
                  <CatalogLessonCard key={lesson.id} lesson={lesson} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
