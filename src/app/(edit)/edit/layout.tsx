import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { hasSession } from "@/lib/auth/requireSession";
import { editBadges } from "@/lib/db/edit";
import { EditNav } from "./EditNav";
import { SignInPrompt } from "./SignInPrompt";

export const maxDuration = 300;
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The door, not the gate: every page under here checks hasSession() itself too (a layout can be skipped).
export default async function EditLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!(await hasSession())) return <SignInPrompt />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:gap-10">
      <aside className="shrink-0 md:w-44">
        <Link href="/" className="mb-4 inline-block text-sm text-muted hover:text-ink">
          ← Board
        </Link>
        <Suspense fallback={<EditNav badges={null} />}>
          <NavWithBadges />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

async function NavWithBadges() {
  return <EditNav badges={await editBadges()} />;
}
