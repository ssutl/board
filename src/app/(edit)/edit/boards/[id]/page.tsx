import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSession } from "@/lib/auth/requireSession";
import { boardForEdit } from "@/lib/db/edit";
import { describeBoardAction, removeItemFromBoardPage, renameBoardAction, setBoardHiddenAction, setCoverAction } from "../../actions";
import { SignInPrompt } from "../../SignInPrompt";
import { ThumbGrid } from "../../ThumbGrid";

const input = "w-full rounded-md border border-edge bg-card px-3 py-1.5 outline-none focus:border-ink";
const button = "rounded-md border border-edge px-2.5 py-1 text-sm hover:border-ink";

export default async function EditBoardPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return <SignInPrompt />;
  const { id } = await params;
  const found = await boardForEdit(id);
  if (!found) notFound();
  const { board, items } = found;
  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <form action={renameBoardAction.bind(null, board.id)} className="flex gap-2">
          <input name="name" defaultValue={board.name} maxLength={60} className={input} />
          <button className={button}>Rename</button>
        </form>
        <form action={describeBoardAction.bind(null, board.id)} className="flex gap-2">
          <input name="description" defaultValue={board.description} maxLength={300} className={input} />
          <button className={button}>Save</button>
        </form>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <form action={setBoardHiddenAction.bind(null, board.id, !board.hidden)}>
          <button className={button}>{board.hidden ? "Show publicly" : "Hide publicly"}</button>
        </form>
        {!board.hidden && (
          <Link href={`/b/${board.slug}`} className="underline">
            View public page
          </Link>
        )}
        <span className="text-muted">{items.length} items</span>
      </div>
      <ThumbGrid
        items={items}
        actions={(item) => (
          <>
            {item.id === board.cover_item_id ? (
              <span className="text-muted">cover</span>
            ) : (
              <form action={setCoverAction.bind(null, board.id, item.id)}>
                <button className="underline">Cover</button>
              </form>
            )}
            <form action={removeItemFromBoardPage.bind(null, board.id, item.id)}>
              <button className="text-muted underline hover:text-ink">Remove</button>
            </form>
          </>
        )}
      />
    </>
  );
}
