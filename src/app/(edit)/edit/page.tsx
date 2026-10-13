import { hasSession } from "@/lib/auth/requireSession";
import { listInbox } from "@/lib/db/edit";
import { retryItem } from "./actions";
import { DropZone } from "./DropZone";
import { SignInPrompt } from "./SignInPrompt";

export default async function EditHome() {
  if (!(await hasSession())) return <SignInPrompt />;
  const inbox = await listInbox();
  return (
    <>
      <DropZone />
      <h2 className="mb-3 text-xs uppercase tracking-wide text-muted">Inbox</h2>
      {inbox.length === 0 ? (
        <p className="text-sm text-muted">Everything is sorted.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {inbox.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 py-2">
              <a href={`/edit/items/${row.id}`} className="min-w-0 truncate underline">
                {row.source_url ?? row.id.slice(0, 8)}
              </a>
              <span className="shrink-0 text-muted">
                {row.stale ? "stuck" : row.status}
                {row.status === "failed" && ` (${row.attempts}×): ${row.error ?? ""}`}
              </span>
              {(row.status !== "processing" || row.stale) && (
                <form action={retryItem.bind(null, row.id)}>
                  <button className="underline">Retry</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
