import { NextResponse } from "next/server";
import { upsertProgress, type WatchSource } from "@/lib/lessons";

type ProgressBody = {
  positionSeconds?: unknown;
  durationSeconds?: unknown;
  source?: unknown;
};

function isWatchSource(value: unknown): value is WatchSource {
  return value === "local" || value === "drive";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: ProgressBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { positionSeconds, durationSeconds, source } = body;

  if (typeof positionSeconds !== "number" || !Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return NextResponse.json({ error: "positionSeconds must be a non-negative number" }, { status: 400 });
  }

  if (durationSeconds !== undefined && durationSeconds !== null) {
    if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return NextResponse.json({ error: "durationSeconds must be a non-negative number or null" }, { status: 400 });
    }
  }

  if (!isWatchSource(source)) {
    return NextResponse.json({ error: "source must be 'local' or 'drive'" }, { status: 400 });
  }

  const lesson = upsertProgress(id, {
    positionSeconds,
    durationSeconds: (durationSeconds as number | null | undefined) ?? null,
    source,
  });

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  return NextResponse.json({ lesson });
}
