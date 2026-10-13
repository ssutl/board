/* eslint-disable @next/next/no-img-element -- may be pending, without dimensions */
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSession } from "@/lib/auth/requireSession";
import { boardOptions, itemForEdit } from "@/lib/db/edit";
import { addItemToBoard, deleteItemAction, removeItemFromBoard, retryItem, setItemHiddenAction, useOriginalImage } from "../../actions";
import { SignInPrompt } from "../../SignInPrompt";

const button = "rounded-md border border-edge px-2.5 py-1 text-sm hover:border-ink";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSession())) return <SignInPrompt />;
  const { id } = await params;
  const [found, options] = await Promise.all([itemForEdit(id), boardOptions()]);
  if (!found) notFound();
  const { item, boards } = found;
  const on = boards.filter((b) => !b.excluded);
  const cropped = item.use_crop && item.image_url && item.uncropped_url && item.image_url !== item.uncropped_url;
  return (
    <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
      <div>
        {(item.image_url ?? item.original_url) && <img src={(item.image_url ?? item.original_url)!} alt={item.caption ?? ""} className={`w-full rounded-sm ${item.hidden ? "opacity-50" : ""}`} />}
        {cropped && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted">Uncropped</summary>
            <img src={item.uncropped_url!} alt="" className="mt-2 w-full rounded-sm" />
          </details>
        )}
      </div>
      <div className="space-y-5 text-sm">
        <p className="text-muted">
          {item.status}
          {item.error && `: ${item.error}`}
        </p>
        {item.caption && <p className="text-base">{item.caption}</p>}
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="block truncate underline">
            {item.title ?? item.source_url}
          </a>
        )}
        <div className="flex flex-wrap gap-2">
          <form action={setItemHiddenAction.bind(null, item.id, !item.hidden)}>
            <button className={button}>{item.hidden ? "Show publicly" : "Hide publicly"}</button>
          </form>
          {cropped && (
            <form action={useOriginalImage.bind(null, item.id)}>
              <button className={button}>Use original instead of crop</button>
            </form>
          )}
          {item.kind === "image" && item.status !== "processing" && (
            <form action={retryItem.bind(null, item.id)}>
              <button className={button}>Reprocess</button>
            </form>
          )}
          <form action={deleteItemAction.bind(null, item.id)}>
            <button className={`${button} text-red-700`}>Delete</button>
          </form>
        </div>
        <div>
          <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">Boards</h2>
          {on.length === 0 && <p className="text-muted">Loose.</p>}
          <ul className="space-y-1">
            {on.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3">
                <Link href={`/edit/boards/${b.id}`} className="underline">
                  {b.name}
                </Link>
                {b.pinned && <span className="text-xs text-muted">placed by you</span>}
                <form action={removeItemFromBoard.bind(null, item.id, b.id)}>
                  <button className="text-muted underline hover:text-ink">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          {item.status === "ready" && item.kind === "image" && (
            <form action={addItemToBoard.bind(null, item.id)} className="mt-3 flex gap-2">
              <select name="boardId" className="flex-1 rounded-md border border-edge bg-card px-2 py-1">
                {options.filter((o) => !on.some((b) => b.id === o.id)).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button className={button}>Add to board</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
