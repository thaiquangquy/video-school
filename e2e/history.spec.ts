import { test, expect } from "@playwright/test";

test.describe("history page", () => {
  test("a watch session shows up under Today after a progress heartbeat", async ({ page, request }) => {
    // markStatus (the Drive lesson's manual buttons) never writes a
    // watch_events row — only upsertProgress does (lib/lessons/sqlite.ts) —
    // so history is driven by the local-video lesson's progress heartbeat.
    await request.post("/api/lessons/e2e-local-lesson/progress", {
      data: { positionSeconds: 1, durationSeconds: 3, source: "local" },
    });

    await page.goto("/history");

    await expect(page.getByText("Today")).toBeVisible();
    await expect(page.getByText("E2E Local Lesson").first()).toBeVisible();
  });
});
