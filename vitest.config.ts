import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Playwright's e2e/**/*.spec.ts files would otherwise match Vitest's
    // default *.spec.ts include pattern too — including copies traced into
    // .next/standalone/ by `next build` (output: "standalone" in
    // next.config.ts), which isn't covered by configDefaults.exclude.
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Scoped to lib/** business logic, matching where the existing unit
      // suite already concentrates — app/**/components/** UI is exercised
      // by the Playwright e2e suite instead (no @testing-library/react here).
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/types.ts",
        "lib/**/*.d.ts",
        // Cloud-mode (Supabase) backend implementations need a live Supabase
        // instance to test meaningfully — covered by the opt-in
        // tests/cross-account-isolation.supabase.test.ts instead, same as
        // that suite is opt-in/out of `npm run test` (see CLAUDE.md).
        "lib/**/supabase.ts",
        "lib/supabase/**",
        // chokidar fs-watching orchestration — thin wiring over the
        // already-unit-tested pure matching logic in lib/videoMatch.ts.
        "lib/watcher.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
