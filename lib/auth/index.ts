// Auth dispatcher: routes to the local (sqlite) or Supabase auth
// implementation based on BACKEND, so callers (Server Actions, proxy.ts)
// never branch on the backend themselves.
import { BACKEND } from "@/lib/backend";
import * as local from "./local";
import * as supabase from "./supabase";

// Both branches return a plain boolean (see lib/auth/local.ts and
// lib/auth/supabase.ts's getSession() doc comments for the shared shape
// contract) — proxy.ts and any other caller never need to know which
// backend produced it.
export async function getSession() {
  if (BACKEND === "sqlite") return local.getSession();
  return supabase.getSession();
}

// signIn/signOut are not dispatched here (yet): local mode's Server Action
// (app/login/actions.ts) calls lib/auth/local.ts's primitives directly —
// there's only one household password/cookie, so there's no per-backend
// branching to hide — and no local-mode signIn/signOut slot exists in this
// dispatcher for a Supabase branch to parallel. lib/auth/supabase.ts
// exports signIn/signOut directly for the cloud-mode login Server Action
// (task 15) to call the same way. If a shared slot is ever needed here,
// wire it up the same way as getSession() above.
