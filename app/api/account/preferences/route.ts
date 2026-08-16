import { NextResponse } from "next/server";
import { updatePreferences } from "@/lib/settings";

export async function PATCH(request: Request) {
  let body: { displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.displayName !== null && typeof body.displayName !== "string") {
    return NextResponse.json({ error: "displayName must be a string or null" }, { status: 400 });
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() || null : null;
  const preferences = await updatePreferences({ displayName });

  return NextResponse.json({ preferences });
}
