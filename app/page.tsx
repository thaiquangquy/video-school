"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  timestamp: string;
};

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data: HealthResponse) => setHealth(data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="card">
      <h1>Homeschool Video Tracker</h1>
      <p className="muted">Placeholder home page — feature pages come in later steps.</p>
      <h2 style={{ marginTop: 20, fontSize: "1rem" }}>API health check</h2>
      {error && <p style={{ color: "#dc2626" }}>Error: {error}</p>}
      {!error && !health && <p className="muted">Checking…</p>}
      {health && (
        <pre style={{ background: "var(--bg-subtle)", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(health, null, 2)}
        </pre>
      )}
    </div>
  );
}
