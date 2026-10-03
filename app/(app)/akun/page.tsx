import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { keluar } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Akun" };

export default async function AkunPage() {
  const user = await requireUser();

  return (
    <main className="px-4 py-6">
      <h1 className="text-lg font-semibold">Akun</h1>

      <dl className="mt-6 divide-y divide-line border-y border-line">
        <div className="flex items-baseline justify-between py-3">
          <dt className="text-sm text-muted">Username</dt>
          <dd className="font-medium">{user.username ?? "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between py-3">
          <dt className="text-sm text-muted">Peran</dt>
          <dd className="font-medium">
            {user.role === "admin" ? "Admin kelas" : "Anggota kelas"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-muted">
        Akun dibuat oleh admin kelas. Kalau lupa kata sandi, minta admin mengatur ulang.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <form action={keluar}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Keluar
          </button>
        </form>
        <Link
          href="/buat"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Buat posting
        </Link>
      </div>
    </main>
  );
}
