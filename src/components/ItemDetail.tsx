import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { boardsForItem, getPublicItem, similarPublicItems } from "@/lib/db/public";
import { Masonry } from "./Masonry";

function Chips({ words }: { words: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map((w) => (
        <span key={w} className="rounded-full border border-edge px-2 py-0.5 text-xs text-muted">
          {w}
        </span>
      ))}
    </div>
  );
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export async function ItemDetail({ id }: { id: string }) {
  const item = await getPublicItem(id);
  if (!item) notFound();
  const [boards, similar] = await Promise.all([boardsForItem(id), similarPublicItems(id, 12)]);
  const t = item.tags;
  const words = [t.what, t.era, ...(t.materials ?? []), ...(t.mood ?? [])].filter((w): w is string => !!w);
  return (
    <article className="grid gap-6 md:grid-cols-[3fr_2fr]">
      <Image
        src={item.image_url}
        alt={item.caption ?? ""}
        width={item.width ?? 1000}
        height={item.height ?? 1000}
        sizes="(min-width: 768px) 60vw, 100vw"
        className="h-auto w-full rounded-sm"
        priority
      />
      <div className="space-y-4 text-sm">
        {item.caption && <p className="text-base leading-snug">{item.caption}</p>}
        {words.length > 0 && <Chips words={words} />}
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noopener noreferrer nofollow" className="block text-muted underline hover:text-ink">
            {item.title ?? host(item.source_url)}
          </a>
        )}
        {boards.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted">On</div>
            {boards.map((b) => (
              <Link key={b.slug} href={`/b/${b.slug}`} className="mr-3 underline hover:text-muted">
                {b.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      {similar.length > 0 && (
        <section className="md:col-span-2">
          <h2 className="mb-3 text-xs uppercase tracking-wide text-muted">More like this</h2>
          <Masonry items={similar} />
        </section>
      )}
    </article>
  );
}
