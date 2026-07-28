"use client";

import { useState } from "react";

export function ResetProgressButton({ lessonId }: { lessonId: string }) {
  const [resetting, setResetting] = useState(false);

  const handleReset = () => {
    if (!window.confirm("Reset watch progress for this lesson? This can't be undone.")) return;

    setResetting(true);
    fetch(`/api/lessons/${lessonId}/reset`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        window.location.reload();
      })
      .catch((err: Error) => {
        console.error(`[DEBUG] ResetProgressButton lesson=${lessonId}:`, err);
        setResetting(false);
      });
  };

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={resetting}
      className="muted"
      style={{
        marginTop: 16,
        fontSize: "0.8rem",
        background: "none",
        border: "none",
        textDecoration: "underline",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {resetting ? "Resetting…" : "Reset progress"}
    </button>
  );
}
