"use client";

import { useActionState } from "react";
import { masuk, type AuthActionState } from "@/app/actions/auth";
import { FieldError, FormMessage, SubmitButton } from "@/components/form-controls";
import { INPUT, LABEL } from "@/lib/ui";

const INITIAL: AuthActionState = {};

export function MasukForm() {
  const [state, formAction] = useActionState(masuk, INITIAL);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className={LABEL}>
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={INPUT}
        />
        <FieldError errors={state.fieldErrors?.username} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={LABEL}>
          Kata sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={INPUT}
        />
        <FieldError errors={state.fieldErrors?.password} />
      </div>

      <FormMessage message={state.message} />

      <div className="mt-2">
        <SubmitButton>Kelas</SubmitButton>
      </div>
    </form>
  );
}