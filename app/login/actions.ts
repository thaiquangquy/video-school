"use server";

// Local-mode sign-in Server Action. Talks to lib/auth/local.ts's primitives
// directly rather than through the lib/auth/index.ts dispatcher — there's
// only one household password and one cookie to set here, so there's no
// per-backend branching to hide; the dispatcher exists for reads
// (getSession(), used by proxy.ts in task 08) and for task 14's Supabase
// signIn/signOut, which do need to hide real backend differences.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSessionCookieValue, COOKIE_NAME } from "@/lib/auth/local";
import { signIn as supabaseSignIn } from "@/lib/auth/supabase";

export type SignInState = { error: string } | null;

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const password = formData.get("password");

  if (typeof password !== "string" || password.length === 0 || !checkPassword(password)) {
    return { error: "Incorrect password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });

  // redirect() throws internally (NEXT_REDIRECT) — must not be wrapped in
  // try/catch above, and nothing after this line runs on success.
  redirect("/");
}

// Cloud-mode sign-in Server Action (task 15). Delegates to
// lib/auth/supabase.ts's signIn(email, password), which uses @supabase/ssr's
// cookie-writable server client — session cookies are set as a side effect
// of signInWithPassword() there, unlike local mode's manual HMAC cookie
// above. Same SignInState shape/error-surfacing pattern as the local action
// so LoginForm.tsx can drive either one through the same useActionState call.
export async function cloudSignIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || email.length === 0 || typeof password !== "string" || password.length === 0) {
    return { error: "Email and password are required." };
  }

  const result = await supabaseSignIn(email, password);
  if (result) {
    return result;
  }

  // redirect() throws internally (NEXT_REDIRECT) — must not be wrapped in
  // try/catch above, and nothing after this line runs on success.
  redirect("/");
}
