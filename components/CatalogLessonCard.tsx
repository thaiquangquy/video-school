"use client";

import { useState } from "react";
import type { LessonWithProgress } from "@/lib/lessons";

// Cloud-mode-only: rendered from app/library/page.tsx's "Browse all lessons"
// section, which only exists when SUPPORTS_ENROLLMENT is true. Deliberately
// not a Link to /watch/[id] like LessonCard — an unenrolled lesson has no
// real progress to show and (per lib/lessons/supabase.ts) isn't accessible
// via getLessonById until enrolled, so this card only ever offers the
// enroll/unenroll action.
export function CatalogLessonCard({ lesson }: { lesson: LessonWithProgress }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enrolled = lesson.isEnrolled ?? false;

  const handleClick = () => {
    setPending(true);
    setError(null);

    const action = enrolled ? "unenroll" : "enroll";
    fetch(`/api/lessons/${lesson.id}/${action}`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        // Matches ResetProgressButton's revalidation convention: a full
        // reload is the simplest way to refresh both the "my lessons" grid
        // and this catalog section from the server after a mutation.
        window.location.reload();
      })
      .catch((err: Error) => {
        console.error(`[DEBUG] CatalogLessonCard ${action} lesson=${lesson.id}:`, err);
        setError(`Couldn't ${action}. Try again.`);
        setPending(false);
      });
  };

  return (
    <div className="card lesson-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{lesson.title}</div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {lesson.subject}
          </div>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className={enrolled ? "btn btn-secondary" : "btn btn-primary"}
          style={{ flexShrink: 0 }}
        >
          {pending ? "…" : enrolled ? "Unenroll" : "Enroll"}
        </button>
      </div>
      {error && (
        <div className="muted" style={{ fontSize: "0.8rem", marginTop: 8, color: "var(--warning)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
