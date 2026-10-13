import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-sm text-muted">Nothing here.</p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        All boards
      </Link>
    </main>
  );
}
