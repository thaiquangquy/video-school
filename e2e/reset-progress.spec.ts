import { test, expect } from "@playwright/test";
import { resetFixtureLessons } from "./utils";

test.describe("reset progress", () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtureLessons(request);
    await request.post("/api/lessons/e2e-drive-lesson/mark-status", { data: { status: "in_progress" } });
  });

  test.afterEach(async ({ request }) => {
    await resetFixtureLessons(request);
  });

  test("resets a touched lesson back to not started", async ({ page }) => {
    await page.goto("/watch/e2e-drive-lesson");

    const resetButton = page.getByRole("button", { name: "Reset progress" });
    await expect(resetButton).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await resetButton.click();

    await expect(page.getByText("Not started", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset progress" })).toHaveCount(0);
  });
});
