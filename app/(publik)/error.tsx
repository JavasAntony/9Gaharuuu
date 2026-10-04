"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-col items-center px-6 py-24 text-center">
      <h1 className="text-xl font-bold">Ada yang bermasalah</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
        Halaman ini gagal dimuat. Coba lagi, atau cek koneksi kamu.
      </p>
      {error.digest ? <p className="mt-1 text-xs text-muted">{error.digest}</p> : null}

      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex min-h-10 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Coba lagi
      </button>
    </main>
  );
}