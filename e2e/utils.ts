import type { APIRequestContext } from "@playwright/test";

export const FIXTURE_LESSON_IDS = ["e2e-drive-lesson", "e2e-local-lesson", "e2e-no-source-lesson"] as const;

/** Resets every fixture lesson's tracked progress back to not_started (does not touch watch_events/history). */
export async function resetFixtureLessons(request: APIRequestContext) {
  for (const id of FIXTURE_LESSON_IDS) {
    await request.post(`/api/lessons/${id}/reset`);
  }
}
