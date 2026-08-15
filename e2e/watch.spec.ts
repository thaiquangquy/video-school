import { test, expect } from "@playwright/test";
import { resetFixtureLessons } from "./utils";

test.describe("watch page", () => {
  test.afterEach(async ({ request }) => {
    await resetFixtureLessons(request);
  });

  test("a Drive-sourced lesson renders the embed and manual status buttons", async ({ page }) => {
    await page.goto("/watch/e2e-drive-lesson");

    await expect(page.locator("iframe")).toBeVisible();
    await expect(page.getByRole("button", { name: "Just started" })).toBeVisible();
    await expect(page.getByRole("button", { name: "In progress" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark completed" })).toBeVisible();

    await page.getByRole("button", { name: "Mark completed" }).click();
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  });

  test("a local-video lesson renders a video element wired to the streaming API", async ({ page, request }) => {
    await page.goto("/watch/e2e-local-lesson");

    const video = page.locator("video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", "/api/lessons/e2e-local-lesson/video");

    // The streaming route (lib/rangeRequest.ts) is exercised directly here
    // rather than through real <video> playback: Playwright's bundled
    // open-source Chromium build doesn't ship H.264 decoding, so asserting
    // on decoded playback would be flaky/environment-dependent. A ranged
    // request against the real fixture file is a faithful check of the
    // route's behavior without depending on codec support.
    const rangeRes = await request.get("/api/lessons/e2e-local-lesson/video", {
      headers: { Range: "bytes=0-99" },
    });
    expect(rangeRes.status()).toBe(206);
    expect(rangeRes.headers()["content-range"]).toMatch(/^bytes 0-99\//);

    // Simulates the heartbeat/pause handler's POST (components/VideoPlayer.tsx)
    // to verify the progress API → UI badge integration end to end.
    await request.post("/api/lessons/e2e-local-lesson/progress", {
      data: { positionSeconds: 1, durationSeconds: 3, source: "local" },
    });
    await page.reload();

    await expect(page.getByText("In progress", { exact: true })).toBeVisible();
    await expect(page.getByText("33%")).toBeVisible();
  });

  test("a lesson with no video source shows the empty-state message", async ({ page }) => {
    await page.goto("/watch/e2e-no-source-lesson");
    await expect(page.getByText("No video source configured for this lesson.")).toBeVisible();
  });
});
