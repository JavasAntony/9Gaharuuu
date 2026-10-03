export default function FeedLoading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <header className="border-b border-line px-4 py-4">
        <h1 className="text-lg font-semibold">Feed kelas</h1>
      </header>

      <ul className="divide-y divide-line">
        {[0, 1, 2].map((row) => (
          <li key={row} className="px-4 py-4">
            <div className="h-3 w-24 animate-pulse rounded bg-line" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-line" />
            <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-line" />
          </li>
        ))}
      </ul>
      <span className="sr-only">Memuat feed…</span>
    </main>
  );
}
