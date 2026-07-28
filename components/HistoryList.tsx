"use client";

import { useState } from "react";
import Link from "next/link";
import type { HistoryItem } from "@/lib/lessons";

const PAGE_SIZE = 20;

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(iso: string): number {
  return startOfDay(new Date(iso));
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type Props = {
  initialItems: HistoryItem[];
  total: number;
};

export function HistoryList({ initialItems, total: initialTotal }: Props) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadMore = () => {
    setLoadingMore(true);
    fetch(`/api/history?limit=${PAGE_SIZE}&offset=${items.length}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data: { items: HistoryItem[]; total: number }) => {
        setItems((prev) => [...prev, ...data.items]);
        setTotal(data.total);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingMore(false));
  };

  if (items.length === 0) {
    return <div className="card empty-state">No watch history yet — start a lesson to see it here.</div>;
  }

  const groups: { label: string; key: number; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const key = dayKey(item.startedAt);
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup.key === key) {
      currentGroup.items.push(item);
    } else {
      groups.push({ label: dayLabel(item.startedAt), key, items: [item] });
    }
  }

  return (
    <div>
      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}

      {groups.map((group) => (
        <div key={group.key}>
          <div className="section-title">{group.label}</div>
          <div className="grid" style={{ gap: 10, marginBottom: 8 }}>
            {group.items.map((item) => {
              const percent =
                item.durationSeconds && item.durationSeconds > 0
                  ? Math.min(100, Math.round(((item.positionSeconds ?? 0) / item.durationSeconds) * 100))
                  : null;

              return (
                <Link
                  key={item.eventId}
                  href={`/watch/${item.lessonId}`}
                  className="card lesson-card"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {item.subject} · {item.source === "local" ? "Local" : "Drive"} ·{" "}
                      {new Date(item.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: "0.85rem", flexShrink: 0 }}>
                    {percent !== null
                      ? `${percent}%`
                      : item.positionSeconds !== null
                        ? formatMMSS(item.positionSeconds)
                        : "—"}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {items.length < total && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button type="button" className="btn btn-secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
