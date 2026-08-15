import { test, expect } from "@playwright/test";
import { resetFixtureLessons } from "./utils";

test.describe("home page", () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtureLessons(request);
  });

  test("shows a Start Here card and the remaining lessons as Up Next when nothing is in progress", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByText("Start Here")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Drive Lesson");
    await expect(page.getByRole("link", { name: "Start Watching" })).toBeVisible();

    await expect(page.getByText("Up Next")).toBeVisible();
    await expect(page.getByText("E2E Local Lesson")).toBeVisible();
    await expect(page.getByText("E2E No Source Lesson")).toBeVisible();
  });

  test("shows a Continue Learning card once a lesson is in progress", async ({ page, request }) => {
    await request.post("/api/lessons/e2e-local-lesson/progress", {
      data: { positionSeconds: 1, durationSeconds: 3, source: "local" },
    });

    await page.goto("/");

    await expect(page.getByText("Continue Learning")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E Local Lesson");
    await expect(page.getByRole("link", { name: "Resume" })).toBeVisible();
  });
});
