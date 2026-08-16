// Backend-agnostic entry point for app/account preferences. Dispatches once
// at module load by BACKEND (lib/backend.ts) — callers never branch on
// backend themselves. Mirrors lib/lessons/index.ts's pattern: sqlite.ts's
// functions accept an optional trailing `database` param (used only by
// tests) that supabase.ts's functions don't have; casting the supabase
// branch to sqlite.ts's type keeps every call site type-checking against one
// stable signature regardless of which backend is active.
import { BACKEND } from "@/lib/backend";
import * as sqliteImpl from "./sqlite";
import * as supabaseImpl from "./supabase";

const impl: typeof sqliteImpl = BACKEND === "supabase" ? (supabaseImpl as unknown as typeof sqliteImpl) : sqliteImpl;

export const getPreferences = impl.getPreferences;
export const updatePreferences = impl.updatePreferences;

export * from "./types";
