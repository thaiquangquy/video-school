import { NextResponse } from "next/server";
import { unenroll } from "@/lib/lessons";

// No-op in local sqlite mode (lib/lessons/sqlite.ts's stub) — harmless if
// ever hit, but the Library page's enroll UI never renders there, so this
// route is only meaningfully called in supabase mode. Removes the
// enrollments row only; watch_progress/watch_events history survives a
// later re-enroll (see lib/lessons/supabase.ts's unenroll()).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await unenroll(id);
  return NextResponse.json({ ok: true });
}
