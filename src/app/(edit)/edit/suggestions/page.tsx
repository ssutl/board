import { hasSession } from "@/lib/auth/requireSession";
import { listBoardsForEdit, thumbsFor } from "@/lib/db/edit";
import { listOpenSuggestions } from "@/lib/db/suggestions";
import { acceptSuggestionAction, rejectSuggestionAction } from "../actions";
import { SignInPrompt } from "../SignInPrompt";
import { ThumbGrid } from "../ThumbGrid";

const button = "rounded-md border border-edge px-2.5 py-1 text-sm hover:border-ink";

export default async function SuggestionsPage() {
  if (!(await hasSession())) return <SignInPrompt />;
  const [suggestions, boards] = await Promise.all([listOpenSuggestions(), listBoardsForEdit()]);
  const boardName = (id: string) => boards.find((b) => b.id === id)?.name ?? "(gone)";
  if (suggestions.length === 0) return <p className="text-sm text-muted">No suggestions. They&apos;re checked nightly.</p>;
  return (
    <div className="space-y-10">
      {await Promise.all(
        suggestions.map(async (s) => (
          <section key={s.id} className="rounded-lg border border-line p-4">
            {s.type === "split" ? (
              <>
                <h2 className="mb-3 text-sm">
                  Split <strong>{boardName(s.payload.boardId)}</strong> into <strong>{s.payload.groups[0].name}</strong> and <strong>{s.payload.groups[1].name}</strong>?
                </h2>
                {await Promise.all(
                  s.payload.groups.map(async (g) => (
                    <div key={g.name} className="mb-4">
                      <div className="mb-1 text-xs text-muted">
                        {g.name}: {g.description}
                      </div>
                      <ThumbGrid items={(await thumbsFor(g.itemIds)).slice(0, 12)} />
                    </div>
                  )),
                )}
              </>
            ) : (
              <h2 className="mb-3 text-sm">
                Merge <strong>{boardName(s.payload.dropId)}</strong> into <strong>{boardName(s.payload.keepId)}</strong>? They&apos;re {Math.round(s.payload.similarity * 100)}% alike.
              </h2>
            )}
            <div className="flex gap-2">
              <form action={acceptSuggestionAction.bind(null, s.id)}>
                <button className={button}>Yes</button>
              </form>
              <form action={rejectSuggestionAction.bind(null, s.id)}>
                <button className={button}>No</button>
              </form>
            </div>
          </section>
        )),
      )}
    </div>
  );
}
