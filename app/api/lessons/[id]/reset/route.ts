import { NextResponse } from "next/server";
import { resetProgress } from "@/lib/lessons";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await resetProgress(id);

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  return NextResponse.json({ lesson });
}
