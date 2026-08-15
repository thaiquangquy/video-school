// Task 18 — cross-account isolation test suite for cloud mode
// (DATA_BACKEND=supabase). See docs/supabase-integration-tasks/18-cross-
// account-isolation-tests.md and docs/supabase-integration-plan.md section
// "9. Testing" (the "cross-account isolation" paragraph) for the full spec.
//
// This is the single most important correctness property cloud mode adds:
// two accounts must never see or affect each other's enrollment/progress/
// history, even though they share the same lesson catalog. Task 11 covers
// individual-function behavior against a single account; this file covers
// the *interaction* between two accounts, which no single-account test can
// catch.
//
// Opt-in / skippable: this suite needs a real local Supabase instance
// (`npx supabase start`, task 09's migrations applied) and hits real
// Postgres + GoTrue over the network, so it does not run as part of the
// fast default `npm run test` suite. It self-skips via `describe.skipIf`
// unless NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are all present in the environment — the same
// three env vars documented in .env.example for cloud mode. Intended
// invocation (matches the plan's convention):
//
//   DATA_BACKEND=supabase npx vitest run tests/cross-account-isolation.supabase.test.ts
//
// Why this file talks to lib/lessons/supabase.ts *and* raw supabase-js
// clients, rather than only one or the other:
//
// - lib/lessons/supabase.ts always goes through lib/supabase/server.ts's
//   `createClient()`, which is bound to Next's `cookies()` (next/headers)
//   and only works inside a real Next.js request. A plain Vitest process has
//   no such request context, and — more importantly — this suite needs TWO
//   independently authenticated accounts active across the same test file,
//   which a single cookie-bound module singleton can't represent at once.
//   We route around that by mocking "@/lib/supabase/server" below to return
//   whichever plain supabase-js client is "current" (see `asUser()`), so the
//   REAL lib/lessons/supabase.ts implementation still runs unmodified —
//   only the transport (cookies vs. an in-memory session) changes. RLS is
//   enforced from the request's JWT regardless of which client library
//   carried it, so this is a faithful substitute, not a weaker one.
// - The "defense-in-depth" case is explicitly required (per the task) to
//   bypass lib/lessons entirely and hit `watch_progress`/`watch_events`/
//   `enrollments` directly with a session-bound client, to prove the
//   isolation guarantee lives in RLS itself and not merely in the views/RPCs
//   lib/lessons/supabase.ts happens to call.
//
// Database reset: truncating via raw SQL isn't available through
// supabase-js (no SQL execution endpoint, and no dependency on a `pg`/
// `postgres` client is added here), so `resetDatabase()` below deletes all
// rows from the four tables with the admin (service-role) client instead,
// in FK-safe child-before-parent order — equivalent in effect to the
// TRUNCATE the plan/task text describes, just expressed through the
// PostgREST surface this project already depends on.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
// Vitest hoists `vi.mock(...)` calls above all imports in this file
// (including this one) regardless of source order, so this static import
// safely resolves to the mocked "@/lib/supabase/server" defined below —
// these are still the real, unmodified lib/lessons/supabase.ts exports.
import {
  getCatalog,
  getEnrolledLessons,
  getLessonById,
  enroll,
  unenroll,
  upsertProgress,
  getHistory,
  getHistorySummary,
} from "@/lib/lessons/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);

// Mutable "which account is currently acting" slot. lib/lessons/supabase.ts
// calls `createClient()` fresh on every function call, so swapping this
// between calls is enough to run the real implementation "as" account A or
// account B without any concurrency — tests in this file await each call
// before switching, exactly like a real single request would.
let currentClient: SupabaseClient | undefined;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (!currentClient) {
      throw new Error("cross-account-isolation.supabase.test.ts: call asUser(client) before invoking lib/lessons/supabase");
    }
    return currentClient;
  },
}));

function asUser(client: SupabaseClient): void {
  currentClient = client;
}

// Deletes all rows from the per-account tables plus the shared catalog, in
// FK-safe (child-before-parent) order, using the service-role client so RLS
// doesn't get in the way. Equivalent to the plan/task's
// `truncate lessons, enrollments, watch_progress, watch_events restart
// identity cascade`, minus resetting identity sequences — no test here
// depends on absolute id/updated_seq values, only relative ordering and row
// counts, so that's fine.
async function resetDatabase(admin: SupabaseClient): Promise<void> {
  await admin.from("watch_events").delete().neq("id", -1);
  await admin.from("watch_progress").delete().neq("lesson_id", "__never_matches__");
  await admin.from("enrollments").delete().neq("lesson_id", "__never_matches__");
  await admin.from("lessons").delete().neq("id", "__never_matches__");
}

describe.skipIf(!hasSupabaseEnv)("cross-account isolation (supabase, opt-in)", () => {
  const LESSON_ID = "cross-account-lesson";
  const PASSWORD = "cross-account-test-password-1234";

  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    admin = createAdminClient();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const emailA = `cross-account-a-${suffix}@example.test`;
    const emailB = `cross-account-b-${suffix}@example.test`;

    const { data: createdA, error: createAError } = await admin.auth.admin.createUser({
      email: emailA,
      password: PASSWORD,
      email_confirm: true,
    });
    if (createAError || !createdA.user) {
      throw new Error(`failed to create test account A: ${createAError?.message}`);
    }
    userAId = createdA.user.id;

    const { data: createdB, error: createBError } = await admin.auth.admin.createUser({
      email: emailB,
      password: PASSWORD,
      email_confirm: true,
    });
    if (createBError || !createdB.user) {
      throw new Error(`failed to create test account B: ${createBError?.message}`);
    }
    userBId = createdB.user.id;

    clientA = createSupabaseJsClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    const { error: signInAError } = await clientA.auth.signInWithPassword({ email: emailA, password: PASSWORD });
    if (signInAError) throw new Error(`failed to sign in test account A: ${signInAError.message}`);

    clientB = createSupabaseJsClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    const { error: signInBError } = await clientB.auth.signInWithPassword({ email: emailB, password: PASSWORD });
    if (signInBError) throw new Error(`failed to sign in test account B: ${signInBError.message}`);
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  beforeEach(async () => {
    await resetDatabase(admin);
    const { error } = await admin
      .from("lessons")
      .insert({ id: LESSON_ID, title: "Cross-Account Test Lesson", subject: "Test", order_index: 1 });
    if (error) throw new Error(`failed to seed test lesson: ${error.message}`);
  });

  it("a lesson neither account enrolled in is absent from getEnrolledLessons/getLessonById, but visible via getCatalog with isEnrolled: false", async () => {
    asUser(clientA);

    const catalog = await getCatalog();
    expect(catalog.find((l) => l.id === LESSON_ID)?.isEnrolled).toBe(false);

    const enrolled = await getEnrolledLessons();
    expect(enrolled.find((l) => l.id === LESSON_ID)).toBeUndefined();

    const lesson = await getLessonById(LESSON_ID);
    expect(lesson).toBeNull();
  });

  it("enrolling seeds a not_started row, and un-enrolling drops it from the enrolled list but preserves watch_progress/watch_events", async () => {
    asUser(clientA);
    await enroll(LESSON_ID);

    const enrolledAfterEnroll = await getEnrolledLessons();
    const seeded = enrolledAfterEnroll.find((l) => l.id === LESSON_ID);
    expect(seeded?.progress.status).toBe("not_started");

    await upsertProgress(LESSON_ID, { positionSeconds: 15, durationSeconds: 100, source: "local" });
    await unenroll(LESSON_ID);

    const enrolledAfterUnenroll = await getEnrolledLessons();
    expect(enrolledAfterUnenroll.find((l) => l.id === LESSON_ID)).toBeUndefined();

    // History survives un-enrolling — verified by going around lib/lessons
    // entirely and reading the tables directly, same as the task's own
    // acceptance wording ("query directly, not through the dispatch layer").
    const { data: progressRow } = await clientA
      .from("watch_progress")
      .select("*")
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID)
      .maybeSingle();
    expect(progressRow).not.toBeNull();
    expect(progressRow?.position_seconds).toBe(15);

    const { data: eventRows } = await clientA
      .from("watch_events")
      .select("*")
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID);
    expect(eventRows?.length ?? 0).toBeGreaterThan(0);
  });

  it("enrollment isolation: A enrolling in a lesson does not make it appear enrolled for B", async () => {
    asUser(clientA);
    await enroll(LESSON_ID);

    asUser(clientB);
    const catalogAsB = await getCatalog();
    expect(catalogAsB.find((l) => l.id === LESSON_ID)?.isEnrolled).toBe(false);

    const enrolledAsB = await getEnrolledLessons();
    expect(enrolledAsB.find((l) => l.id === LESSON_ID)).toBeUndefined();

    const lessonAsB = await getLessonById(LESSON_ID);
    expect(lessonAsB).toBeNull();
  });

  it("progress isolation: independent enrollments give independent progress, in both directions", async () => {
    asUser(clientA);
    await enroll(LESSON_ID);
    asUser(clientB);
    await enroll(LESSON_ID);

    // A watches halfway.
    asUser(clientA);
    await upsertProgress(LESSON_ID, { positionSeconds: 50, durationSeconds: 100, source: "local" });

    // B's independently-enrolled progress is untouched by A's heartbeat.
    asUser(clientB);
    const bLessonBeforeBWatches = await getLessonById(LESSON_ID);
    expect(bLessonBeforeBWatches?.progress.status).toBe("not_started");
    expect(bLessonBeforeBWatches?.progress.positionSeconds).toBe(0);

    // B finishes the lesson.
    await upsertProgress(LESSON_ID, { positionSeconds: 100, durationSeconds: 100, source: "local" });
    const bLessonAfter = await getLessonById(LESSON_ID);
    expect(bLessonAfter?.progress.status).toBe("completed");

    // A's earlier progress is unaffected by B's completion.
    asUser(clientA);
    const aLessonAfter = await getLessonById(LESSON_ID);
    expect(aLessonAfter?.progress.status).toBe("in_progress");
    expect(aLessonAfter?.progress.positionSeconds).toBe(50);
  });

  it("history isolation: getHistory/getHistorySummary for each account reflect only that account's watch_events", async () => {
    asUser(clientA);
    await enroll(LESSON_ID);
    asUser(clientB);
    await enroll(LESSON_ID);

    asUser(clientA);
    await upsertProgress(LESSON_ID, { positionSeconds: 30, durationSeconds: 100, source: "local" });

    asUser(clientB);
    await upsertProgress(LESSON_ID, { positionSeconds: 80, durationSeconds: 100, source: "local" });

    asUser(clientA);
    const historyA = await getHistory(20, 0);
    expect(historyA.items).toHaveLength(1);
    expect(historyA.items[0].lessonId).toBe(LESSON_ID);
    expect(historyA.items[0].positionSeconds).toBe(30);

    const summaryA = await getHistorySummary();
    expect(summaryA.distinctLessonsTouched).toBe(1);

    asUser(clientB);
    const historyB = await getHistory(20, 0);
    expect(historyB.items).toHaveLength(1);
    expect(historyB.items[0].lessonId).toBe(LESSON_ID);
    expect(historyB.items[0].positionSeconds).toBe(80);

    const summaryB = await getHistorySummary();
    expect(summaryB.distinctLessonsTouched).toBe(1);
  });

  it("direct row-level isolation (defense-in-depth): B's session-bound client cannot select/update/delete A's rows via RLS, and neither can A's own writes be observed as B's", async () => {
    asUser(clientA);
    await enroll(LESSON_ID);
    await upsertProgress(LESSON_ID, { positionSeconds: 42, durationSeconds: 100, source: "local" });

    asUser(clientB);
    await enroll(LESSON_ID);

    // Grab the actual row ids belonging to A so B's attempts below target
    // real rows, not ones that would trivially miss regardless of RLS.
    const { data: aProgressRow } = await clientA
      .from("watch_progress")
      .select("*")
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID)
      .single();
    const { data: aEventRow } = await clientA
      .from("watch_events")
      .select("*")
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID)
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(aProgressRow).toBeTruthy();
    expect(aEventRow).toBeTruthy();

    // --- enrollments: B tries to read/update/delete A's enrollment row ---
    const enrollmentSelect = await clientB.from("enrollments").select("*").eq("user_id", userAId).eq("lesson_id", LESSON_ID);
    expect(enrollmentSelect.error).toBeNull();
    expect(enrollmentSelect.data).toEqual([]);

    const enrollmentDelete = await clientB
      .from("enrollments")
      .delete()
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID)
      .select();
    expect(enrollmentDelete.error).toBeNull();
    expect(enrollmentDelete.data).toEqual([]); // zero rows affected, not an error

    // --- watch_progress: B tries to read/update A's progress row ---
    const progressSelect = await clientB
      .from("watch_progress")
      .select("*")
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID);
    expect(progressSelect.error).toBeNull();
    expect(progressSelect.data).toEqual([]);

    const progressUpdate = await clientB
      .from("watch_progress")
      .update({ status: "completed", position_seconds: 999 })
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID)
      .select();
    expect(progressUpdate.error).toBeNull();
    expect(progressUpdate.data).toEqual([]); // zero rows affected, not an error

    // --- watch_events: B tries to read/update/delete A's event row by id ---
    const eventSelect = await clientB.from("watch_events").select("*").eq("id", aEventRow!.id);
    expect(eventSelect.error).toBeNull();
    expect(eventSelect.data).toEqual([]);

    const eventUpdate = await clientB
      .from("watch_events")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", aEventRow!.id)
      .select();
    expect(eventUpdate.error).toBeNull();
    expect(eventUpdate.data).toEqual([]);

    const eventDelete = await clientB.from("watch_events").delete().eq("id", aEventRow!.id).select();
    expect(eventDelete.error).toBeNull();
    expect(eventDelete.data).toEqual([]);

    // Confirm none of B's attempts actually mutated A's rows: still present,
    // still A's original values, read back through A's own client.
    const { data: aProgressStillThere } = await clientA
      .from("watch_progress")
      .select("*")
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID)
      .single();
    expect(aProgressStillThere?.status).toBe("in_progress");
    expect(aProgressStillThere?.position_seconds).toBe(42);

    const { data: aEnrollmentStillThere } = await clientA
      .from("enrollments")
      .select("*")
      .eq("user_id", userAId)
      .eq("lesson_id", LESSON_ID)
      .maybeSingle();
    expect(aEnrollmentStillThere).not.toBeNull();

    const { data: aEventStillThere } = await clientA.from("watch_events").select("*").eq("id", aEventRow!.id).maybeSingle();
    expect(aEventStillThere).not.toBeNull();
  });
});
