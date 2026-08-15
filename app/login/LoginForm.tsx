"use client";

// Client half of the login page: needs useActionState, so it can't live in
// the Server Component that reads BACKEND (lib/backend.ts reads
// process.env.DATA_BACKEND directly, unprefixed — importing it from a "use
// client" file would silently resolve to undefined in the browser bundle
// rather than the real runtime value, since only NEXT_PUBLIC_-prefixed vars
// get inlined for client code). app/login/page.tsx decides the mode
// server-side and passes it down as a plain boolean prop instead.
import { useActionState } from "react";
import { signIn, cloudSignIn, type SignInState } from "./actions";

const initialState: SignInState = null;

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  marginBottom: 12,
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg-subtle)",
  color: "var(--fg)",
};

export default function LoginForm({ cloud }: { cloud: boolean }) {
  const action = cloud ? cloudSignIn : signIn;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      {cloud && (
        <>
          <label htmlFor="email" style={{ display: "block", marginBottom: 6 }}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            style={fieldStyle}
          />
        </>
      )}
      <label htmlFor="password" style={{ display: "block", marginBottom: 6 }}>
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus={!cloud}
        autoComplete="current-password"
        style={fieldStyle}
      />
      {state?.error && (
        <p role="alert" style={{ color: "var(--warning)", marginBottom: 12 }}>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--accent)",
          color: "var(--accent-fg)",
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
