import Link from "next/link";
import { type NavItem } from "@/lib/nav";
import { CARD, PILL_GHOST, PILL_PRIMARY } from "@/lib/ui";

/**
 * The wide-screen aside next to the timeline.
 *
 * Purely a second route to somewhere the rail already goes, plus the rules of the
 * room, so nothing here is the only way to reach a page. `xl:block` keeps it off
 * the 1024-1279px range, where the three columns would squeeze the timeline below
 * the width a post's text needs.
 */
export function RightRail({
  items,
  isSignedIn,
}: {
  items: NavItem[];
  isSignedIn: boolean;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[350px] shrink-0 overflow-y-auto px-4 py-4 xl:block">
      {!isSignedIn ? (
        <section className={`${CARD} p-4`}>
          <h2 className="text-base font-bold">Masuk dulu, tidak wajib</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Kamu bisa baca, kirim, dan membalas tanpa akun. Masuk kalau mau memakai
            namamu dan menyimpan suka.
          </p>
          <Link href="/masuk" className={`${PILL_PRIMARY} mt-4 w-full`}>
            Masuk kelas
          </Link>
        </section>
      ) : null}

      <nav aria-label="Tautan cepat" className={`${CARD} mt-4 overflow-hidden`}>
        <h2 className="px-4 pt-4 pb-2 text-sm font-bold">Tautan cepat</h2>
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent-soft/40"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent [&>svg]:size-[18px]">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className={`${CARD} mt-4 p-4`}>
        <h2 className="text-sm font-bold">Aturan ruang ini</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          <li>Posting tanpa nama tetap tanpa nama. Tidak ada yang bisa menyingkirkan.</li>
          <li>Nama asli di balik konten anonim hanya terlihat admin kelas.</li>
          <li>Balasan hanya satu tingkat, jadi percakapan tidak bercabang-cabang.</li>
        </ul>
        <Link href="/buat" className={`${PILL_GHOST} mt-4 w-full`}>
          Mulai posting
        </Link>
      </section>
    </aside>
  );
}