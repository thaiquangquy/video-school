// Single source of truth for which persistence backend the app runs against.
// Read once at module load and fail loudly on a bad value — nothing else
// should read `process.env.DATA_BACKEND` directly.
const raw = process.env.DATA_BACKEND ?? "sqlite";

if (raw !== "sqlite" && raw !== "supabase") {
  throw new Error(`Invalid DATA_BACKEND "${raw}" — must be "sqlite" or "supabase"`);
}

export const BACKEND = raw;
export const SUPPORTS_ENROLLMENT = BACKEND === "supabase";
