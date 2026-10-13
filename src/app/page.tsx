import { BoardCard } from "@/components/BoardCard";
import { SearchBox } from "@/components/SearchBox";
import { listPublicBoards } from "@/lib/db/public";

export const dynamic = "force-dynamic";

export default async function Home() {
  const boards = await listPublicBoards();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold tracking-wide">board.ssutl.com</h1>
        <SearchBox />
      </header>
      {boards.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3">
          {boards.map((b) => (
            <BoardCard key={b.id} board={b} />
          ))}
        </div>
      ) : (
        <p className="py-24 text-center text-sm text-muted">Boards appear here as they form.</p>
      )}
    </main>
  );
}
