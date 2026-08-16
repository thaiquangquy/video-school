import type Database from "better-sqlite3";
import { db } from "../db";
import type { Preferences } from "./types";

type SettingsRow = {
  display_name: string | null;
};

// Declared async (though sqlite itself is synchronous under the hood) so
// this satisfies the same shape contract as lib/lessons/sqlite.ts's
// functions — the dispatched interface in lib/settings/index.ts must work
// identically whether the supabase implementation behind it does real
// network I/O or not.
//
// Local mode has one shared household login, not per-user accounts, so this
// is a single app-wide row (id = 1) rather than scoped to a user id.
export async function getPreferences(database: Database.Database = db): Promise<Preferences> {
  const row = database.prepare<[], SettingsRow>("SELECT display_name FROM app_settings WHERE id = 1").get();

  return { displayName: row?.display_name ?? null };
}

export async function updatePreferences(
  prefs: Partial<Preferences>,
  database: Database.Database = db,
): Promise<Preferences> {
  const current = await getPreferences(database);
  const next: Preferences = { ...current, ...prefs };

  database
    .prepare(
      `INSERT INTO app_settings (id, display_name) VALUES (1, @displayName)
       ON CONFLICT(id) DO UPDATE SET display_name = @displayName`,
    )
    .run({ displayName: next.displayName });

  return next;
}
