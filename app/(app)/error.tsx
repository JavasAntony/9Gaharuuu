"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Ada yang bermasalah</h1>
      <p className="mt-2 text-sm text-muted">
        Halaman ini gagal dimuat. Coba lagi, atau cek koneksi kamu.
      </p>
      <p className="mt-1 text-xs text-muted">{error.digest}</p>

      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 font-medium transition-colors hover:border-accent hover:text-accent"
      >
        Coba lagi
      </button>
    </main>
  );
}
