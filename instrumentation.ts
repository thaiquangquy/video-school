export async function register() {
  // better-sqlite3 (and the folder watcher, added later) are Node-only —
  // skip on the edge runtime instrumentation pass.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { BACKEND } = await import("./lib/backend");
  const { syncLessonsFromManifest } = await import("./lib/sync");
  const { startVideoWatcher } = await import("./lib/watcher");

  if (BACKEND === "sqlite") {
    const { initSchema } = await import("./lib/db");
    initSchema();
  }

  const result = await syncLessonsFromManifest();
  console.log(
    `[startup] Synced ${result.synced} lesson(s) from manifest` +
      (result.archived > 0 ? `, archived ${result.archived} removed from manifest` : ""),
  );

  await startVideoWatcher();
}
