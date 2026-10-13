import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Masonry } from "@/components/Masonry";
import { SWATCHES } from "@/components/swatches";
import { isPaletteColour } from "@/lib/config";
import { boardItems, boardPalette, getPublicBoard } from "@/lib/db/public";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ colour?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const board = await getPublicBoard((await params).slug);
  if (!board) return {};
  return { title: board.name, description: board.description || undefined, openGraph: { images: board.coverUrl ? [board.coverUrl] : [] } };
}

export default async function BoardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { colour } = await searchParams;
  const board = await getPublicBoard(slug);
  if (!board) notFound();
  const active = colour && isPaletteColour(colour) ? colour : null;
  const [items, palette] = await Promise.all([boardItems(board.id, active), boardPalette(board.id)]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← All boards
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{board.name}</h1>
      {board.description && <p className="mt-1 max-w-xl text-muted">{board.description}</p>}
      {palette.length > 1 && (
        <nav className="my-5 flex flex-wrap gap-2">
          {palette.filter((p) => isPaletteColour(p.colour)).map((p) => (
            <Link
              key={p.colour}
              href={active === p.colour ? `/b/${slug}` : `/b/${slug}?colour=${p.colour}`}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${active === p.colour ? "border-ink" : "border-edge text-muted"}`}
            >
              <span className="h-3 w-3 rounded-full border border-edge" style={{ background: SWATCHES[p.colour as keyof typeof SWATCHES] }} />
              {p.colour}
            </Link>
          ))}
        </nav>
      )}
      <div className="mt-6">
        <Masonry items={items} empty={active ? `Nothing ${active} here.` : undefined} />
      </div>
    </main>
  );
}
