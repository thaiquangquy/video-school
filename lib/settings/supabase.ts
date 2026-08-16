import { createClient } from "@/lib/supabase/server";
import type { Preferences } from "./types";

// Cloud mode has real per-account logins — display name lives in Supabase
// Auth's built-in user_metadata rather than a separate profiles table, since
// it's the only preference we store today.
export async function getPreferences(): Promise<Preferences> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return { displayName: (data.user?.user_metadata?.display_name as string | undefined) ?? null };
}

export async function updatePreferences(prefs: Partial<Preferences>): Promise<Preferences> {
  const supabase = await createClient();
  const current = await getPreferences();
  const next: Preferences = { ...current, ...prefs };

  const { error } = await supabase.auth.updateUser({ data: { display_name: next.displayName } });
  if (error) {
    console.error("[ERROR] lib/settings/supabase.updatePreferences: updateUser failed", { message: error.message });
  }

  return next;
}
