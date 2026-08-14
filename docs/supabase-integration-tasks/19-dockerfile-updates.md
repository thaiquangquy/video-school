# Task 19 — Dockerfile updates for both modes

Phase F — Verification & deployment. Depends on: 08, 17. Full context: [`../supabase-integration-plan.md`](../supabase-integration-plan.md) section "10. Docker / deployment".

## Goal

One Docker image serves both modes, but with an important asymmetry to get right: most new env vars are pure runtime (`docker run -e ...`, no rebuild needed), but `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` get inlined into the JS bundle by `next build`, so cloud-mode deployments need their own image build with those passed as build args.

## Files

- `Dockerfile` (update)
- A short deployment doc (e.g. append to `docs/supabase-integration-plan.md`'s Docker section is already written — add a standalone `docs/deployment.md` or fold examples into `README.md`, whichever fits this repo's existing doc structure better; check `README.md` first for where deployment instructions currently live)

## Steps

1. In the `builder` stage of `Dockerfile`, add:
   ```dockerfile
   ARG NEXT_PUBLIC_SUPABASE_URL=""
   ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
   ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
   ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
   ```
   before the `RUN npm run build` line — empty-string defaults so local-mode builds (which don't pass these) don't fail.
2. In the `runner` stage, no changes needed for `SUPABASE_SERVICE_ROLE_KEY`/`APP_PASSWORD`/`SESSION_SECRET`/`DATA_BACKEND` — these stay pure `docker run -e` runtime vars, don't bake them into the image at all (they're either secrets that shouldn't be in image layers, or mode-switches that should stay runtime-configurable).
3. Review the existing comment block about `better-sqlite3`'s `--ignore-scripts` in the `deps` stage — it's still accurate (local mode still uses `better-sqlite3`, unlike the original fully-migrate-away plan draft), so it should **not** be removed; just confirm it's still correct given this task's changes don't touch that stage.
4. Document both `docker run` invocations somewhere discoverable (check `README.md`'s existing Docker section first, per `CLAUDE.md`'s note that the Docker command is documented there):
   - Local: `docker build -t video-school . && docker run -d --name video-school -p 3000:3000 -e DATA_BACKEND=sqlite -e APP_PASSWORD=... -e SESSION_SECRET=... -v "$(pwd)/data:/app/data" video-school`
   - Cloud: `docker build -t video-school --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... . && docker run -d --name video-school -p 3000:3000 -e DATA_BACKEND=supabase -e SUPABASE_SERVICE_ROLE_KEY=... -e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... -v "$(pwd)/data:/app/data" video-school` (the two `NEXT_PUBLIC_*` vars are passed at both build and run time — build time for the inlined bundle, run time because server-side code in this app also reads `process.env` directly for these, so pass both to avoid confusion about which one "actually" controls behavior).

## Acceptance test

Build and run local mode: `docker run` with `APP_PASSWORD` changed and the container restarted (no rebuild) picks up the new password — confirms it's a true runtime var. Build and run cloud mode against a real or local Supabase instance (task 09's schema applied): confirm the login page and, after auth, the enroll/browse/watch flow all work inside the container exactly as they do under `npm run dev`. Then rebuild cloud mode with a *different* `NEXT_PUBLIC_SUPABASE_URL` build arg and confirm the old container (not rebuilt) keeps pointing at the original URL — demonstrating the build-time-baked behavior is real, not accidentally also reading the runtime env var for that specific pair of vars.
