import type { Metadata } from "next";
import Link from "next/link";
import { MasukForm } from "./MasukForm";
import { Brand } from "@/lib/nav";

export const metadata: Metadata = { title: "Masuk" };

export default function MasukPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <Brand />

        <h1 className="mt-8 text-3xl font-bold tracking-tight">Masuk kelas</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Identitasmu tetap tersembunyi saat kamu mengirim secara Anonim. Akun dibuat oleh
          admin kelas.
        </p>

        <MasukForm />

        <p className="mt-8 text-center text-sm text-muted">
          <Link href="/feed" className="font-semibold text-accent hover:underline">
            Lanjut baca dulu
          </Link>
        </p>
      </div>
    </main>
  );
}