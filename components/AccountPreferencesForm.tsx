"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initialDisplayName: string | null;
};

export function AccountPreferencesForm({ initialDisplayName }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    fetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() || null }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        setSaved(true);
        router.refresh();
      })
      .catch((err: Error) => {
        console.error("[DEBUG] AccountPreferencesForm.handleSubmit:", err);
        setError("Couldn't save your display name — try again.");
      })
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 420 }}>
      <label htmlFor="displayName" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
        Display name
      </label>
      <input
        id="displayName"
        type="text"
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
          setSaved(false);
        }}
        placeholder="e.g. Sam"
        style={{
          width: "100%",
          padding: "8px 10px",
          marginBottom: 12,
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--fg)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && !error && (
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Saved
          </span>
        )}
        {error && (
          <span style={{ fontSize: "0.85rem", color: "#dc2626" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
