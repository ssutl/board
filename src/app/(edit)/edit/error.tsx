"use client";

export default function EditError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-md border border-edge bg-card p-4 text-sm">
      <p className="mb-3">{error.message || "Something went wrong."}</p>
      <button onClick={reset} className="underline">
        Try again
      </button>
    </div>
  );
}
