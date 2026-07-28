import { NextResponse } from "next/server";
import { getAllLessons } from "@/lib/lessons";

export async function GET() {
  const lessons = getAllLessons();
  return NextResponse.json({ lessons });
}
