import Image from "next/image";
import Link from "next/link";
import type { BoardCardData } from "@/lib/db/public";

function Tile({ src, className = "" }: { src?: string; className?: string }) {
  return (
    <div className={`relative bg-line ${className}`}>
      {src && <Image src={src} alt="" fill sizes="(min-width: 768px) 22vw, 45vw" className="object-cover" />}
    </div>
  );
}

/** Gallery-wall cover: one big image and two small ones, then the name and count. */
export function BoardCard({ board }: { board: BoardCardData }) {
  const [a, b, c] = board.images;
  return (
    <Link href={`/b/${board.slug}`} className="group block">
      <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] grid-rows-2 gap-1 overflow-hidden rounded-md">
        <Tile src={a} className="row-span-2" />
        <Tile src={b ?? a} />
        <Tile src={c ?? b ?? a} />
      </div>
      <div className="mt-2 text-sm font-medium group-hover:underline">{board.name}</div>
      <div className="text-xs text-muted">
        {board.count} {board.count === 1 ? "item" : "items"}
      </div>
    </Link>
  );
}
