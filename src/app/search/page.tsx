import Link from "next/link";
import { Masonry } from "@/components/Masonry";
import { SearchBox } from "@/components/SearchBox";
import { embedQuery } from "@/lib/ai/gemini";
import { searchPublic } from "@/lib/db/public";
import { BudgetExceeded } from "@/lib/db/usage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 200);
  let result: Awaited<ReturnType<typeof searchPublic>> | null = null;
  let resting = false;
  if (q) {
    try {
      result = await searchPublic(await embedQuery(q));
    } catch (error) {
      if (!(error instanceof BudgetExceeded)) throw error;
      resting = true;
    }
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← All boards
        </Link>
        <SearchBox defaultValue={q} />
      </header>
      {resting && <p className="py-16 text-center text-sm text-muted">Search is resting for today. Try again tomorrow.</p>}
      {result && result.boards.length > 0 && (
        <p className="mb-4 text-sm">
          Boards:{" "}
          {result.boards.map((b) => (
            <Link key={b.slug} href={`/b/${b.slug}`} className="mr-3 underline">
              {b.name}
            </Link>
          ))}
        </p>
      )}
      {result && <Masonry items={result.items} empty="Nothing like that yet." />}
    </main>
  );
}
