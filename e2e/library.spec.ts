import { test, expect } from "@playwright/test";
import { resetFixtureLessons } from "./utils";

test.describe("library page", () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtureLessons(request);
  });

  test("lists fixture lessons grouped under their subject", async ({ page }) => {
    await page.goto("/library");

    await expect(page.locator(".section-title", { hasText: "E2E" })).toBeVisible();
    await expect(page.getByText("E2E Drive Lesson")).toBeVisible();
    await expect(page.getByText("E2E Local Lesson")).toBeVisible();
    await expect(page.getByText("E2E No Source Lesson")).toBeVisible();
  });

  test("clicking a lesson card navigates to its watch page", async ({ page }) => {
    await page.goto("/library");
    await page.getByText("E2E Drive Lesson").click();
    await page.waitForURL("/watch/e2e-drive-lesson");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Drive Lesson");
  });
});
