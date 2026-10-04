import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { keluar } from "@/app/actions/auth";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { CARD, PILL_GHOST, PILL_PRIMARY } from "@/lib/ui";

export const metadata: Metadata = { title: "Akun" };

export default async function AkunPage() {
  const user = await requireUser();

  return (
    <main>
      <PageHeader title="Akun" />

      <div className="px-4 py-4">
        <section className={`${CARD} flex items-center gap-4 p-4`}>
          <Avatar name={user.username ?? "?"} size="lg" />

          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{user.username}</h2>
            <p className="text-sm text-muted">
              {user.role === "admin" ? "Admin kelas" : "Anggota kelas"}
            </p>
          </div>
        </section>

        <section className={`${CARD} mt-4 overflow-hidden`}>
          <dl className="divide-y divide-line">
            <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
              <dt className="text-sm text-muted">Username</dt>
              <dd className="truncate font-semibold">{user.username ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
              <dt className="text-sm text-muted">Peran</dt>
              <dd className="font-semibold">
                {user.role === "admin" ? "Admin kelas" : "Anggota kelas"}
              </dd>
            </div>
          </dl>
        </section>

        <p className="mt-4 px-1 text-sm leading-relaxed text-muted">
          Akun dibuat oleh admin kelas. Kalau lupa kata sandi, minta admin mengatur ulang.
          Saat kamu meng—like atau berkomentar secara Anonim, nama ini tidak ikut tampil.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/media" className={PILL_PRIMARY}>
            Kirim gambar
          </Link>
          <form action={keluar}>
            <button type="submit" className={PILL_GHOST}>
              Keluar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}