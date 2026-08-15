import { BACKEND } from "../backend";

// Backend-agnostic entry point for manifest sync — dispatches to the sqlite
// or supabase implementation based on DATA_BACKEND (see lib/backend.ts).
// Both implementations expose the same syncLessonsFromManifest signature;
// only the sqlite path also pre-seeds watch_progress, since local mode has
// one shared dataset rather than per-account state (see lib/sync/supabase.ts
// for why cloud mode doesn't do that here).
export const { syncLessonsFromManifest } =
  BACKEND === "supabase" ? await import("./supabase") : await import("./sqlite");
