// Backend-agnostic entry point for the lessons data layer. Every exported
// function here is async so the supabase-backed implementation can do real
// network I/O behind the same signatures the sqlite implementation already
// satisfies synchronously-under-the-hood. Dispatches once at module load by
// BACKEND (lib/backend.ts) — callers never branch on backend themselves.
import { BACKEND } from "@/lib/backend";
import * as sqliteImpl from "./sqlite";
import * as supabaseImpl from "./supabase";

// The dispatched public interface follows sqlite.ts's shape — it's the
// superset: sqlite.ts's functions accept an optional trailing `database`
// param (used only by tests, e.g. tests/lessons.test.ts's `fn(..., testDb)`
// calls) that supabase.ts's functions don't have and don't need. Passing
// that extra arg to a supabase.ts function at runtime is harmless (JS
// ignores extra arguments); casting the supabase branch to sqlite.ts's type
// keeps every call site type-checking against one stable signature
// regardless of which backend is actually active, instead of TS inferring a
// union type across both branches (which would intersect same-position
// parameter types — e.g. `Database & number` — and break real call sites).
const impl: typeof sqliteImpl = BACKEND === "supabase" ? (supabaseImpl as unknown as typeof sqliteImpl) : sqliteImpl;

export const getAllLessons = impl.getAllLessons;
export const getLessonById = impl.getLessonById;
export const getEnrolledLessons = impl.getEnrolledLessons;
export const getCatalog = impl.getCatalog;
export const enroll = impl.enroll;
export const unenroll = impl.unenroll;
export const upsertProgress = impl.upsertProgress;
export const markStatus = impl.markStatus;
export const resetProgress = impl.resetProgress;
export const getContinueLearning = impl.getContinueLearning;
export const getHistory = impl.getHistory;
export const getHistorySummary = impl.getHistorySummary;

// lib/watcher.ts's dispatch surface (task 13) — see lib/lessons/sqlite.ts /
// lib/lessons/supabase.ts's "lib/watcher.ts dispatch surface" sections.
export const getUnmatchedLessons = impl.getUnmatchedLessons;
export const getLessonsWithLocalPath = impl.getLessonsWithLocalPath;
export const setLocalPath = impl.setLocalPath;
export const clearLocalPath = impl.clearLocalPath;

export * from "./types";
