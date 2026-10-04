"use client";

import { useActionState } from "react";
import { buatAkun } from "@/app/actions/users";
import { FieldError, FormMessage } from "@/components/form-controls";
import { ModerationButton } from "../ModerationButton";
import { INPUT, LABEL } from "@/lib/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

/**
 * Create an account.
 *
 * There is no signup form anywhere in the app, so this is the only way a classmate arrives.
 * That is why the password is set here rather than chosen by them: the account exists before
 * its owner has ever seen the screen.
 *
 * The form is remounted on success with the same `key` trick as `PostComposer`, which is why
 * this is a keyed element in the page rather than something with a reset effect.
 *
 * The role is a two-option select rather than free text: `simpan_akun_baru` validates it
 * against the same two values `profiles.role` allows, and a select cannot produce a third.
 */
export function BuatAkunForm() {
  const [state, action] = useActionState(buatAkun, INITIAL);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="username" className={LABEL}>
          Username
        </label>
        {/* `pattern` mirrors USERNAME_PATTERN so the browser refuses the obvious cases
            before a round trip. The schema in lib/validation.ts is the real check; this is
            only so a classmate is told at the field rather than at the bottom of the form. */}
        <input
          id="username"
          name="username"
          required
          autoComplete="off"
          spellCheck={false}
          pattern="[a-z0-9._\-]{3,24}"
          placeholder="mis. ratu"
          className={`${INPUT} mt-1.5`}
        />
        <FieldError errors={state.fieldErrors?.username} />
      </div>

      <div>
        <label htmlFor="password" className={LABEL}>
          Kata sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          placeholder={`minimal ${MIN_PASSWORD_LENGTH} karakter`}
          className={`${INPUT} mt-1.5`}
        />
        <FieldError errors={state.fieldErrors?.password} />
      </div>

      <div>
        <label htmlFor="role" className={LABEL}>
          Peran
        </label>
        <select id="role" name="role" defaultValue="member" className={`${INPUT} mt-1.5`}>
          <option value="member">Anggota kelas</option>
          <option value="admin">Admin kelas</option>
        </select>
      </div>

      <div className="flex items-end">
        <ModerationButton pendingLabel="Membuat..." className="w-full sm:w-auto">
          Buat akun
        </ModerationButton>
      </div>

      <div className="sm:col-span-2">
        <FormMessage message={state.message} />
      </div>
    </form>
  );
}