"use client";

import { useActionState, useState } from "react";
import { blokirAkun, bukaBlokirAkun, hapusAkunLangsung, ubahPeranAkun } from "@/app/actions/users";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FieldError, FormMessage } from "@/components/form-controls";
import { BAN_DURATIONS } from "@/lib/bans";
import { INPUT, LABEL } from "@/lib/ui";
import { type ActionState } from "@/lib/action-state";
import { ModerationButton } from "../ModerationButton";

const INITIAL: ActionState = {};

/** What the page already computed server-side, so no timestamp is ever formatted here. */
export type AccountRow = {
  id: string;
  username: string;
  role: "member" | "admin";
  createdAt: string;
  postCount: number;
  commentCount: number;
  likeCount: number;
  /** Whether the ban applies right now, per `private.akun_terblokir()` in the view. */
  bannedNow: boolean;
  /** Set when a ban was applied and has since expired: worth showing, but not active. */
  banExpired: boolean;
  banReason: string | null;
  bannedUntilLabel: string | null;
  bannedAtLabel: string | null;
  bannedBy: string | null;
};

/**
 * One account, with the four things an admin can do to it.
 *
 * Every action gets its own `<form>` and its own `useActionState`, for the same reason
 * `ReportRow` does: a failed ban must not disable the unban button next to it, and a
 * failure is rendered under the form that produced it so a retry needs no reload.
 *
 * Deleting an account is the exception: it goes through `ConfirmDialog` and
 * `hapusAkunLangsung` rather than a form, because it is the one action here that removes
 * somebody's whole history and an accidental tap on a button next to a role change is not
 * something a busy admin should be able to undo.
 *
 * The disabled states are presentation, never the boundary. Your own row has no ban, role or
 * delete button because `P0003` would refuse them; the last active admin's ban and demote
 * buttons are off because `P0004` would refuse those. A forged request still hits the RPC.
 *
 * The ban form lives behind a `<details>` rather than inline: four of these on a screen at
 * once, each with two inputs, is a wall of controls for something that is rarely done, and a
 * row you cannot read is a row you cannot check against the roster.
 */
export function UserRow({
  account,
  isSelf,
  locksOutClass,
}: {
  account: AccountRow;
  isSelf: boolean;
  locksOutClass: boolean;
}) {
  const [banState, banAction] = useActionState(blokirAkun, INITIAL);
  const [unbanState, unbanAction] = useActionState(bukaBlokirAkun, INITIAL);
  const [roleState, roleAction] = useActionState(ubahPeranAkun, INITIAL);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted">
        <span className="text-sm font-bold text-foreground">{account.username}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            account.role === "admin"
              ? "bg-accent-soft text-accent"
              : "bg-background text-muted border border-line"
          }`}
        >
          {account.role === "admin" ? "Admin kelas" : "Anggota kelas"}
        </span>

        {account.bannedNow ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
            Dibekukan
          </span>
        ) : account.banExpired ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted">
            Blokir sudah habis
          </span>
        ) : null}

        {isSelf ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold">
            Kamu
          </span>
        ) : null}

        <span className="ml-auto">{account.createdAt}</span>
      </div>

      <p className="mt-1 text-xs text-muted">
        {account.postCount} posting · {account.commentCount} komentar · {account.likeCount} suka
      </p>

      {account.banReason ? (
        <blockquote className="mt-2 rounded-xl border border-line bg-accent-soft/40 px-3 py-2 text-sm">
          <p className="whitespace-pre-wrap break-words">{account.banReason}</p>
          <footer className="mt-1 text-xs text-muted">
            {account.bannedBy ? `Diblokir oleh ${account.bannedBy}` : "Diblokir"}
            {account.bannedAtLabel ? ` · ${account.bannedAtLabel}` : ""}
            {account.bannedUntilLabel
              ? account.bannedNow
                ? ` · sampai ${account.bannedUntilLabel}`
                : ` · berakhir ${account.bannedUntilLabel}`
              : ""}
          </footer>
        </blockquote>
      ) : null}

      <div className="mt-3 flex flex-wrap items-start gap-2">
        {account.bannedNow ? (
          <form action={unbanAction} className="flex items-center gap-2">
            <input type="hidden" name="targetId" value={account.id} />
            <ModerationButton pendingLabel="Membuka...">Buka blokir</ModerationButton>
          </form>
        ) : (
          <details className="group">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-line px-4 text-sm font-semibold transition-colors hover:border-accent hover:text-accent">
              Blokir akun
            </summary>

            <form action={banAction} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="targetId" value={account.id} />

              <div>
                <label htmlFor={`duration-${account.id}`} className={LABEL}>
                  Lama
                </label>
                <select
                  id={`duration-${account.id}`}
                  name="duration"
                  defaultValue="7d"
                  className={`${INPUT} mt-1.5`}
                >
                  {BAN_DURATIONS.map((duration) => (
                    <option key={duration.value} value={duration.value}>
                      {duration.label}
                    </option>
                  ))}
                </select>
                <FieldError errors={banState.fieldErrors?.duration} />
              </div>

              <div>
                <label htmlFor={`reason-${account.id}`} className={LABEL}>
                  Alasan
                </label>
                <input
                  id={`reason-${account.id}`}
                  name="reason"
                  maxLength={500}
                  placeholder="Boleh kosong, tapi akan muncul diRiwayat"
                  className={`${INPUT} mt-1.5`}
                />
                <FieldError errors={banState.fieldErrors?.reason} />
              </div>

              <div className="sm:col-span-2">
                <ModerationButton
                  tone="danger"
                  pendingLabel="Membekukan..."
                  disabled={isSelf || locksOutClass}
                >
                  Bekukan
                </ModerationButton>
              </div>
            </form>
          </details>
        )}

        {!isSelf ? (
          <form action={roleAction}>
            <input type="hidden" name="targetId" value={account.id} />
            <input
              type="hidden"
              name="role"
              value={account.role === "admin" ? "member" : "admin"}
            />
            <ModerationButton
              pendingLabel="Menyimpan..."
              disabled={account.role !== "admin" && locksOutClass}
            >
              {account.role === "admin" ? "Jadikan anggota" : "Jadikan admin"}
            </ModerationButton>
          </form>
        ) : null}

        {!isSelf ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm font-semibold text-muted transition-colors hover:text-accent"
          >
            Hapus akun
          </button>
        ) : null}
      </div>

      {locksOutClass && !account.bannedNow ? (
        <p className="mt-2 text-xs text-muted">
          Admin terakhir yang masih aktif, jadi blokir dan penurunan peran ditahan supaya kelas
          tidak terkunci.
        </p>
      ) : null}

      <div className="mt-2 flex flex-col gap-1 text-sm">
        <FormMessage message={banState.message} />
        <FormMessage message={unbanState.message} />
        <FormMessage message={roleState.message} />
      </div>

      {confirming ? (
        <ConfirmDialog
          title={`Hapus akun ${account.username}?`}
          confirmLabel="Hapus permanen"
          pendingLabel="Menghapus..."
          description={
            <>
              <p>
                Akun ini, {account.postCount} posting, {account.commentCount} komentar, dan
                semua gambarnya akan hilang permanen.
              </p>
              <p className="mt-2">
                Tindakan ini tidak bisa dibatalkan dan tidak bisa dilakukan pada akun sendiri.
              </p>
            </>
          }
          onConfirm={() => hapusAkunLangsung(account.id)}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </li>
  );
}