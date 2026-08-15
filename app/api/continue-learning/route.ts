import { NextResponse } from "next/server";
import { getContinueLearning } from "@/lib/lessons";

export async function GET() {
  const result = await getContinueLearning();
  return NextResponse.json(result);
}
