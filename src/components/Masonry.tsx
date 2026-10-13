import Image from "next/image";
import Link from "next/link";
import type { PublicItem } from "@/lib/db/public";

export function Masonry({ items, empty = "Nothing here yet." }: { items: PublicItem[]; empty?: string }) {
  if (items.length === 0) return <p className="py-16 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
      {items.map((item) => (
        <Link key={item.id} href={`/i/${item.id}`} scroll={false} className="mb-3 block break-inside-avoid overflow-hidden rounded-sm bg-card">
          <Image
            src={item.image_url}
            alt={item.caption ?? ""}
            width={item.width ?? 1000}
            height={item.height ?? 1000}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="h-auto w-full transition-opacity hover:opacity-90"
          />
        </Link>
      ))}
    </div>
  );
}
