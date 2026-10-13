import { hasSession } from "@/lib/auth/requireSession";
import { MIN_LOOSE_TO_GROW } from "@/lib/config";
import { listLooseForEdit } from "@/lib/db/edit";
import { deleteItemAction } from "../actions";
import { SignInPrompt } from "../SignInPrompt";
import { ThumbGrid } from "../ThumbGrid";

export default async function LoosePage() {
  if (!(await hasSession())) return <SignInPrompt />;
  const { images, links } = await listLooseForEdit();
  const toGo = Math.max(0, MIN_LOOSE_TO_GROW - images.length);
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Loose</h1>
      <p className="mb-4 text-sm text-muted">
        Not on any board yet. {toGo > 0 ? `${toGo} more until new boards can form.` : "New boards form when 6+ of these look alike."}
      </p>
      <ThumbGrid items={images} />
      <h2 className="mb-3 mt-10 text-xs uppercase tracking-wide text-muted">Link cards</h2>
      {links.length === 0 ? (
        <p className="text-sm text-muted">None.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 py-2">
              <a href={l.source_url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline">
                {l.title ?? l.source_url}
              </a>
              {l.blocked_source && <span className="shrink-0 text-muted">screenshot this instead</span>}
              <form action={deleteItemAction.bind(null, l.id)}>
                <button className="text-muted underline hover:text-ink">Delete</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
