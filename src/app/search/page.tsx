import Link from "next/link";
import { Masonry } from "@/components/Masonry";
import { SearchBox } from "@/components/SearchBox";
import { embedQuery, isTransient } from "@/lib/ai/gemini";
import { BudgetExceeded } from "@/lib/db/usage";
import { searchPublic } from "@/lib/db/public";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q; // ?q=a&q=b arrives as an array: take the first
  const q = ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim().slice(0, 200);
  let result: Awaited<ReturnType<typeof searchPublic>> | null = null;
  let resting: string | null = null;
  if (q) {
    try {
      result = await searchPublic(await embedQuery(q));
    } catch (error) {
      if (!isTransient(error)) throw error; // out of today's searches, or rate-limited
      resting = error instanceof BudgetExceeded ? "Search is resting for today. Try again tomorrow." : "Search is busy. Try again in a minute.";
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
      {resting && <p className="py-16 text-center text-sm text-muted">{resting}</p>}
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
