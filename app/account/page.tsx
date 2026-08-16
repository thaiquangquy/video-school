import { getHistory, getHistorySummary } from "@/lib/lessons";
import { getPreferences } from "@/lib/settings";
import { HistoryList } from "@/components/HistoryList";
import { AccountPreferencesForm } from "@/components/AccountPreferencesForm";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function formatWatchTime(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default async function AccountPage() {
  const { displayName } = await getPreferences();
  const { items, total } = await getHistory(PAGE_SIZE, 0);
  const summary = await getHistorySummary();

  return (
    <div>
      <h1 style={{ marginBottom: 20, fontSize: "1.4rem" }}>Account</h1>

      <div className="section-title">Preferences</div>
      <div style={{ marginBottom: 32 }}>
        <AccountPreferencesForm initialDisplayName={displayName} />
      </div>

      <div className="section-title">History</div>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="muted" style={{ fontSize: "0.8rem" }}>Lessons completed</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{summary.completedCount}</div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: "0.8rem" }}>Lessons touched</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{summary.distinctLessonsTouched}</div>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: "0.8rem" }}>Watch time this week</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{formatWatchTime(summary.watchTimeThisWeekSeconds)}</div>
        </div>
      </div>

      <HistoryList initialItems={items} total={total} />
    </div>
  );
}
