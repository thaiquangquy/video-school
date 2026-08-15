import fs from "node:fs";
import path from "node:path";

/**
 * Runs once before the whole e2e suite. Removes any leftover fixture sqlite
 * db from a previous run so every run starts from a clean state synced
 * fresh from e2e/fixtures/data/lessons.yaml by instrumentation.ts on
 * webServer startup.
 */
export default function globalSetup() {
  const dbPath = path.join(__dirname, "fixtures/data/app.db");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
}
