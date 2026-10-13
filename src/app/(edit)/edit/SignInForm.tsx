"use client";

import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { signIn } from "./signIn";

/**
 * Carries the path it is standing on, so /edit/books signs in and lands on /edit/books. The
 * browser could of course post any path back; safeEditPath() in the action is what decides.
 */
export function SignInForm() {
  const pathname = usePathname();
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={pathname} />
      <input
        type="password"
        name="password"
        placeholder="Password"
        autoFocus
        required
        className="rounded-md border border-line bg-card px-3 py-2 outline-none focus:border-accent"
      />
      <button disabled={pending} className="rounded-md bg-ink px-3 py-2 text-paper disabled:opacity-60">
        {pending ? "Checking…" : "Enter"}
      </button>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
