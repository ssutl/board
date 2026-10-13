/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { hasSession } from "@/lib/auth/requireSession";
import { listBoardsForEdit } from "@/lib/db/edit";
import { SignInPrompt } from "../SignInPrompt";

export default async function EditBoardsPage() {
  if (!(await hasSession())) return <SignInPrompt />;
  const boards = await listBoardsForEdit();
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Boards</h1>
      {boards.length === 0 && <p className="text-sm text-muted">No boards yet. They form from Loose.</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {boards.map((b) => (
          <Link key={b.id} href={`/edit/boards/${b.id}`} className="block">
            <div className="aspect-[4/3] overflow-hidden rounded-md bg-line">
              {b.cover_url && <img src={b.cover_url} alt="" className={`h-full w-full object-cover ${b.hidden ? "opacity-40" : ""}`} />}
            </div>
            <div className="mt-1 text-sm font-medium">{b.name}</div>
            <div className="text-xs text-muted">
              {b.count} items{b.hidden && " · hidden"}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
