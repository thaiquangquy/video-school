import { getAllLessons, type LessonWithProgress } from "@/lib/lessons";
import { LessonCard } from "@/components/LessonCard";

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
  const lessons = getAllLessons();
  const bySubject = groupBySubject(lessons);

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
    </div>
  );
}
