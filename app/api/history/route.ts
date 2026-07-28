import { NextResponse } from "next/server";
import { getHistory, getHistorySummary } from "@/lib/lessons";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const offsetParam = Number.parseInt(searchParams.get("offset") ?? "", 10);

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  const result = getHistory(limit, offset);
  const summary = offset === 0 ? getHistorySummary() : undefined;

  return NextResponse.json({ ...result, limit, offset, summary });
}
