import { BoardCard } from "@/components/BoardCard";
import { Masonry } from "@/components/Masonry";
import { SearchBox } from "@/components/SearchBox";
import { listPublicBoards, unsortedItems } from "@/lib/db/public";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [boards, unsorted] = await Promise.all([listPublicBoards(), unsortedItems()]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-semibold tracking-wide">board.ssutl.com</h1>
          <p className="text-sm text-muted">Domain for all my visions and screenshots</p>
          <p className="text-sm italic text-muted">You have to see it to believe it</p>
        </div>
        <SearchBox />
      </header>
      {boards.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3">
          {boards.map((b) => (
            <BoardCard key={b.id} board={b} />
          ))}
        </div>
      )}
      {unsorted.length > 0 && (
        <section className={boards.length > 0 ? "mt-14" : ""}>
          <h2 className="mb-3 text-xs uppercase tracking-wide text-muted">Unsorted</h2>
          <Masonry items={unsorted} />
        </section>
      )}
      {boards.length === 0 && unsorted.length === 0 && <p className="py-24 text-center text-sm text-muted">Nothing here yet.</p>}
    </main>
  );
}
