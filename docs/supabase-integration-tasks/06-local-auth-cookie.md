# Task 06 — Local-mode HMAC session cookie

Phase B — Local auth. Depends on: 01. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "7. Auth".

## Goal

Local mode's login gate has no external auth service — a single shared household password, checked against an env var, backing a signed httpOnly cookie. This task builds the sign/verify primitives only (no UI, no routes yet — that's task 07).

## Files

- `lib/auth/local.ts` (new)

## Steps

1. Env vars (already documented in `.env.example` by task 01): `APP_PASSWORD` (the shared password to check submissions against), `SESSION_SECRET` (random string used to HMAC-sign the cookie payload).
2. Implement using Node's built-in `crypto` (`createHmac`) — no new dependency:
   ```ts
   import { createHmac, timingSafeEqual } from "crypto";

   const COOKIE_NAME = "session";
   const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

   function sign(payload: string): string {
     return createHmac("sha256", requireEnv("SESSION_SECRET")).update(payload).digest("hex");
   }

   export function createSessionCookieValue(): string {
     const exp = Date.now() + SESSION_DURATION_MS;
     const payload = String(exp);
     return `${payload}.${sign(payload)}`;
   }

   export function verifySessionCookieValue(value: string | undefined): boolean {
     if (!value) return false;
     const [payload, signature] = value.split(".");
     if (!payload || !signature) return false;
     const expected = sign(payload);
     const sigBuf = Buffer.from(signature);
     const expBuf = Buffer.from(expected);
     if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;
     const exp = Number(payload);
     return Number.isFinite(exp) && Date.now() < exp;
   }

   export function checkPassword(submitted: string): boolean {
     const expected = requireEnv("APP_PASSWORD");
     const a = Buffer.from(submitted);
     const b = Buffer.from(expected);
     return a.length === b.length && timingSafeEqual(a, b);
   }
   ```
   (`requireEnv` — a small helper that throws a clear error if the env var is missing; add it here or reuse if one already exists elsewhere in `lib/`.) Use `timingSafeEqual` for both the signature check and the password check to avoid timing side-channels — this is a real internet-facing login now (cloud mode is remotely accessible; keep local mode's helper equally careful since the same `proxy.ts` gate pattern is shared).
3. Export a `COOKIE_NAME` constant for task 07/08 to use consistently when reading/writing the cookie via Next's `cookies()` API.

## Acceptance test

Unit tests (e.g. `tests/auth-local.test.ts`):
- `checkPassword` returns `true` for the exact `APP_PASSWORD` value, `false` otherwise.
- `createSessionCookieValue()` followed by `verifySessionCookieValue()` on the same value returns `true`.
- A tampered value (flip one character of the signature half) returns `false`.
- A value with an `exp` in the past returns `false` (mock `Date.now()` or construct an expired payload directly and re-sign it with a real signature to isolate the expiry check from the signature check).
