// Server Component: decides local vs. cloud login form shape from BACKEND.
// This has to stay a server-only read — lib/backend.ts's BACKEND comes from
// process.env.DATA_BACKEND, which isn't NEXT_PUBLIC_-prefixed, so it must
// not be imported from the "use client" form component (see LoginForm.tsx).
// The actual interactive form (useActionState, hooks) lives in LoginForm.tsx.
import { BACKEND } from "@/lib/backend";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const cloud = BACKEND === "supabase";

  return (
    <div className="card" style={{ maxWidth: 360, margin: "60px auto", padding: 24 }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: 20 }}>Sign in</h1>
      <LoginForm cloud={cloud} />
    </div>
  );
}
