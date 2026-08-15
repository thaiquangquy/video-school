import { NextResponse } from "next/server";
import { enroll } from "@/lib/lessons";

// No-op in local sqlite mode (lib/lessons/sqlite.ts's stub) — harmless if
// ever hit, but the Library page's enroll UI never renders there, so this
// route is only meaningfully called in supabase mode.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await enroll(id);
  return NextResponse.json({ ok: true });
}
