"use client";

import { useActionState, useState } from "react";
import { MAX_POST_LENGTH } from "@/lib/constants";
import { AnonymousToggle } from "@/components/AnonymousToggle";
import { FieldError, FormMessage, SubmitButton } from "@/components/form-controls";
import { type ActionState } from "@/lib/action-state";

const INITIAL: ActionState = {};

type PostAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function BuatForm({ action }: { action: PostAction }) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <Composer
      key={state.successToken ?? "editing"}
      formAction={formAction}
      state={state}
    />
  );
}

function Composer({
  formAction,
  state,
}: {
  formAction: (formData: FormData) => void;
  state: ActionState;
}) {
  const [content, setContent] = useState("");
  const remaining = MAX_POST_LENGTH - content.length;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="content" className="text-sm font-medium">
            Isi posting
          </label>
          <span
            className={`text-xs tabular-nums ${remaining < 50 ? "text-accent" : "text-muted"}`}
          >
            {content.length}/{MAX_POST_LENGTH}
          </span>
        </div>

        <textarea
          id="content"
          name="content"
          rows={5}
          maxLength={MAX_POST_LENGTH}
          required
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Bagian satu, mulai dari sini."
          className="w-full resize-y rounded-md border border-line px-3 py-2 text-base leading-relaxed outline-none focus-visible:border-accent"
        />
        <FieldError errors={state.fieldErrors?.content} />
      </div>

      <AnonymousToggle />

      <FormMessage message={state.message} />

      <SubmitButton>Kirim</SubmitButton>
    </form>
  );
}
