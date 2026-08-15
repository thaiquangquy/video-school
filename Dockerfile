# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

# --- deps: install dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts skips better-sqlite3's node-gyp rebuild step; it already
# ships a matching prebuilt linuxmusl-arm64/x64 addon (see lib/binding.js),
# and no other dependency here needs an install/postinstall script.
RUN npm ci --ignore-scripts

# --- builder: compile the Next.js app (standalone output) ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars get inlined into the JS bundle at build time by `next build`,
# unlike DATA_BACKEND/APP_PASSWORD/SESSION_SECRET/SUPABASE_SERVICE_ROLE_KEY which
# stay pure runtime `docker run -e` vars (see README's Docker section). Defaulted
# to empty string so a local-mode build (no --build-arg passed) still succeeds.
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
RUN npm run build

# --- runner: minimal production image ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Seed data/ (lessons.yaml + empty videos/) so the image runs standalone; bind-mount
# your real ./data over this at runtime to persist the db, manifest edits, and videos.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
RUN mkdir -p /app/data/videos && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "server.js"]
