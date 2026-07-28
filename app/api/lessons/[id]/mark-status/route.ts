import { NextResponse } from "next/server";
import { markStatus, type WatchStatus } from "@/lib/lessons";

function isWatchStatus(value: unknown): value is WatchStatus {
  return value === "not_started" || value === "in_progress" || value === "completed";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isWatchStatus(body.status)) {
    return NextResponse.json(
      { error: "status must be one of 'not_started', 'in_progress', 'completed'" },
      { status: 400 },
    );
  }

  const lesson = markStatus(id, body.status);

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  return NextResponse.json({ lesson });
}
