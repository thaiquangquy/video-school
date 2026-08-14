# Task 20 — Update `CLAUDE.md` for both modes

Phase F — Verification & deployment. Depends on: 19. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) (whole document — this task is the documentation summary of everything else).

## Goal

`CLAUDE.md` currently documents the app as local-only/no-auth/LAN-only (Architecture section) and gives a single Docker run command (Commands section). Both are now only correct for local mode. Update it to describe the dual-backend design so future work (by Claude Code or anyone else) starts from an accurate picture.

**Only do this task if the user actually wants `CLAUDE.md` updated as part of this work** — the plan flags this as optional/deferred to the user's preference, not a hard requirement of the integration itself. Confirm before starting if it's not already clear from context.

## Files

- `CLAUDE.md`

## Steps

1. **Commands section**: update the Docker run example(s) to reflect task 19's two-mode invocations (or link to wherever task 19 ended up documenting them, to avoid duplicating the exact command in two places that can drift).
2. **Architecture section**: the opening line currently reads "Local-only Next.js App Router app (no auth, not internet-facing, LAN only)..." — replace with a description of the two modes (local/sqlite vs cloud/supabase), pointing at `docs/supabase-integration-plan.md` for the full design rather than re-deriving it inline. Keep `CLAUDE.md` itself concise — it's meant to be a fast-orientation doc, not the full plan.
3. Add a short new subsection (or extend an existing one) describing: the `DATA_BACKEND` env var and what it controls, where the dispatch layer lives (`lib/lessons/`, `lib/sync/`, `lib/auth/`), and the one behavioral divergence between modes worth calling out explicitly (cloud mode's enrollment feature) so a future reader isn't surprised the two modes aren't purely a backend swap.
4. Update the "Testing" section to mention the opt-in Supabase test suite (`tests/lessons.supabase.test.ts` and friends) and that it requires `npx supabase start` locally, distinct from the default `npm run test`.
5. Don't restate the full schema or SQL here — link to `supabase/migrations/0001_init.sql` and `docs/supabase-integration-plan.md` instead, consistent with `CLAUDE.md`'s existing style of describing behavior/architecture rather than reproducing code.

## Acceptance test

No automated test — this is a documentation task. Review: does `CLAUDE.md` now give an accurate 30-second orientation to someone who's never seen this integration, without requiring them to read the full plan first for the basics (what `DATA_BACKEND` does, where to look for each backend's implementation, how to run tests against both)?
