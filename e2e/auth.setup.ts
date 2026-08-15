import { test as setup } from "@playwright/test";
import path from "node:path";

const authFile = path.join(__dirname, ".auth/user.json");

// eslint-disable-next-line playwright/expect-expect -- auth setup step, not an assertion-bearing test
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#password").fill("e2e-test-password");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/");
  await page.context().storageState({ path: authFile });
});
