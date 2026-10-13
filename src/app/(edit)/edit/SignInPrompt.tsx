import { SignInForm } from "./SignInForm";

/**
 * The whole of the edit side when there is no session: the layout shows it in place of the
 * page, and every page shows it in place of itself, since a page can be rendered without its
 * layout (see the comment in layout.tsx). Either way the same card, on the path asked for.
 */
export function SignInPrompt() {
  return (
    <main className="mx-auto mt-24 max-w-xs px-4">
      <h1 className="mb-6 text-3xl font-semibold">Board</h1>
      <SignInForm />
    </main>
  );
}
