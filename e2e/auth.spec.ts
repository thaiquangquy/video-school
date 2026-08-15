import { test, expect } from "@playwright/test";

// Auth flows must run unauthenticated — override the "chromium" project's
// shared storageState (a logged-in session) with an empty one.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("authentication", () => {
  test("redirects an unauthenticated visitor to /login with a next param", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/");
  });

  test("shows an error for the wrong password and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#password").fill("wrong-password");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('p[role="alert"]')).toHaveText("Incorrect password.");
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("logs in with the correct password and reaches the home page", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#password").fill("e2e-test-password");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
