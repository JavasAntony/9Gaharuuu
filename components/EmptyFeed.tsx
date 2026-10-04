import Link from "next/link";

/**
 * The empty state for a feed.
 *
 * Both feeds need one that says *which* feed ran out, not just that something did. "Nothing
 * here" and "nothing here yet" are different sentences, and on a split feed the reader has
 * to know which list they are looking at before they decide whether the other one is worth
 * opening. Each copy names the other feed as a link, so the empty state is also the cheapest
 * way to get from one to the other.
 */
export function EmptyFeed({ kind, hasCursor }: { kind: "text" | "media"; hasCursor: boolean }) {
  if (hasCursor) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-base font-bold">Sudah sampai ujungnya.</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Tidak ada posting lagi setelah ini.
        </p>
      </div>
    );
  }

  return kind === "text" ? (
    <div className="px-6 py-16 text-center">
      <p className="text-base font-bold">Belum ada apa-apa di sini.</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Mulai percakapan dulu dengan teks. Bisa juga tanpa akun.{" "}
        <Link href="/media" className="text-accent underline underline-offset-4">
          Kirim gambar
        </Link>{" "}
        di feed media.
      </p>
    </div>
  ) : (
    <div className="px-6 py-16 text-center">
      <p className="text-base font-bold">Belum ada gambar di sini.</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Kirim foto atau meme kelas di sini. Teks saja ada di{" "}
        <Link href="/feed" className="text-accent underline underline-offset-4">
          feed utama
        </Link>
        .
      </p>
    </div>
  );
}