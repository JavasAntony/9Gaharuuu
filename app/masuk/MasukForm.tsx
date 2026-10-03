"use client";

import { useActionState } from "react";
import { masuk, type AuthActionState } from "@/app/actions/auth";
import { FieldError, FormMessage, SubmitButton } from "@/components/form-controls";

const INITIAL: AuthActionState = {};

export function MasukForm() {
  const [state, formAction] = useActionState(masuk, INITIAL);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium">
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
          className="min-h-11 rounded-md border border-line px-3 py-2 text-base outline-none focus-visible:border-accent"
        />
        <FieldError errors={state.fieldErrors?.username} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Kata sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-11 rounded-md border border-line px-3 py-2 text-base outline-none focus-visible:border-accent"
        />
        <FieldError errors={state.fieldErrors?.password} />
      </div>

      <FormMessage message={state.message} />

      <SubmitButton>Kelas</SubmitButton>
    </form>
  );
}
