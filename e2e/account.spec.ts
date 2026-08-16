import { test, expect } from "@playwright/test";

test.describe("account page", () => {
  test.afterEach(async ({ request }) => {
    // Display name is a single shared household setting (local mode) — reset
    // it so it doesn't leak into other specs sharing the fixture db.
    await request.patch("/api/account/preferences", { data: { displayName: null } });
  });

  test("a watch session shows up under Today after a progress heartbeat", async ({ page, request }) => {
    // markStatus (the Drive lesson's manual buttons) never writes a
    // watch_events row — only upsertProgress does (lib/lessons/sqlite.ts) —
    // so history is driven by the local-video lesson's progress heartbeat.
    await request.post("/api/lessons/e2e-local-lesson/progress", {
      data: { positionSeconds: 1, durationSeconds: 3, source: "local" },
    });

    await page.goto("/account");

    await expect(page.getByText("Today")).toBeVisible();
    await expect(page.getByText("E2E Local Lesson").first()).toBeVisible();
  });

  test("saving a display name persists it and shows it on the Home page greeting", async ({ page }) => {
    await page.goto("/account");

    await page.getByLabel("Display name").fill("Sam");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("Sam");

    await page.goto("/");
    await expect(page.getByText("Welcome back, Sam!")).toBeVisible();
  });

  test("/history redirects to /account", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/account$/);
  });
});
