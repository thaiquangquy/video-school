// Session gate: redirects unauthenticated requests to /login before any
// page or API route renders.
//
// Next.js 16 renamed `middleware.ts` to `proxy.ts` (functionally
// equivalent, see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Proxy always runs on the Node.js runtime, so `cookies()` from
// `next/headers` is usable here to *read* the local-mode session cookie
// (per the same package's 02-guides/authentication.md "Optimistic checks
// with Proxy" example) — which is what lets sqlite mode reuse the
// lib/auth dispatcher's getSession() as-is.
//
// Supabase mode is different and gets its own branch below rather than
// going through the dispatcher. Reasons, verified against source, not
// assumed:
//   - node_modules/next/dist/docs/.../functions/cookies.md's own method
//     table says `cookies().set()` only writes the outgoing response in
//     Server Functions/Route Handlers — Proxy isn't listed as a supported
//     write context, only "read incoming request cookies" is documented
//     for contexts like this one.
//   - lib/auth/supabase.ts's getSession() → lib/supabase/server.ts's
//     createClient() writes refreshed cookies via `next/headers`
//     cookies().set(), wrapped in a try/catch that *silently swallows* the
//     write when it throws (see that file's setAll comment) — exactly what
//     happens when it's invoked from a non-write context.
//   - node_modules/@supabase/ssr/dist/main/createServerClient.d.ts's own
//     doc comment is explicit: "Use in middlewares... The cookies option
//     must implement both getAll and setAll so that token refreshes can be
//     written back to the response... Failing to implement getAll and
//     setAll correctly will cause significant and difficult to debug
//     authentication issues" — and its example setAll writes via
//     `response.cookies.set(...)` (NextResponse), not `next/headers`.
// So for supabase mode, proxy.ts builds its own request/response-bound
// Supabase client per @supabase/ssr's documented Next.js middleware
// pattern: read cookies off `request.cookies`, and on refresh write them to
// both `request.cookies` (so this same request sees the refreshed session
// if anything downstream re-reads it) and a `NextResponse` built from that
// request (so the browser gets the refreshed `Set-Cookie`s) — then return
// that same response.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSession } from "@/lib/auth";
import { BACKEND } from "@/lib/backend";

// Read lazily (per-call), not at module load — mirrors lib/supabase/server.ts
// and lib/auth/supabase.ts's own requireEnv helpers, and for the same
// reason: this module must be importable (and its sqlite-mode path
// exercised) without cloud-mode env vars being set.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}"`);
  }
  return value;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

// Standard @supabase/ssr Next.js middleware pattern (see file header for why
// this can't just delegate to lib/auth/supabase.ts's getSession()).
async function proxySupabase(request: NextRequest) {
  // Reassigned inside setAll below whenever cookies need to be written —
  // the response ultimately returned must be the one that got them, per
  // @supabase/ssr's documented pattern.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror onto the request too, so anything downstream in this same
        // proxy invocation that reads request.cookies sees the refreshed
        // values, not just the browser on the next round-trip.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and supabase.auth.getUser()
  // — per @supabase/ssr's own guidance, that's a common source of hard-to-
  // debug random logouts. getUser() (not getSession()) re-validates against
  // the Supabase Auth server and transparently refreshes a stale access
  // token, which is what drives the setAll above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirectToLogin(request);

  // Must return this exact response — it's the one (if any) that carries
  // the refreshed Set-Cookie headers back to the browser.
  return response;
}

export async function proxy(request: NextRequest) {
  if (BACKEND === "supabase") return proxySupabase(request);

  // sqlite mode: unchanged from before — local mode's session is a signed
  // cookie that's only ever read, never refreshed, so there's no cookie-
  // propagation concern and the dispatcher's getSession() is reused as-is.
  const session = await getSession();
  if (session) return NextResponse.next();

  return redirectToLogin(request);
}

export const config = {
  matcher: [
    // Everything except: /login (avoid a redirect loop), Next's static
    // asset paths, and /api/health (must stay reachable unauthenticated
    // for uptime checks / the Docker healthcheck).
    "/((?!login|_next/static|_next/image|api/health|favicon.ico).*)",
  ],
};
