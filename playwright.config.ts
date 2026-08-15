import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The whole suite shares one small fixture sqlite db — parallel workers
  // would race on the same lesson rows, so run serially instead.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(__dirname, "e2e/.auth/user.json"),
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: "npx next dev -H 0.0.0.0 -p 3100",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATA_BACKEND: "sqlite",
      APP_PASSWORD: "e2e-test-password",
      SESSION_SECRET: "e2e-test-secret",
      DB_PATH: "e2e/fixtures/data/app.db",
      LESSONS_MANIFEST_PATH: "e2e/fixtures/data/lessons.yaml",
      APP_CONFIG_PATH: "e2e/fixtures/data/config.yaml",
    },
  },
});
