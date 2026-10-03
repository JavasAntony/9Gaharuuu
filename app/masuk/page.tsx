import type { Metadata } from "next";
import { MasukForm } from "./MasukForm";

export const metadata: Metadata = { title: "Masuk" };

export default function MasukPage() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="text-xs font-semibold tracking-[0.2em] text-accent">KELASKITA</h1>
      <h2 className="mt-2 text-2xl font-semibold">Masuk kelas</h2>
      <p className="mt-2 text-sm text-muted">
        Identitasmu tetap tersembunyi saat kamu mengirim secara Anonim.
      </p>

      <MasukForm />
    </main>
  );
}
