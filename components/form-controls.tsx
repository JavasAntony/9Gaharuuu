"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Mengirim...",
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 font-medium text-white transition-opacity disabled:opacity-60 ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ message }: { message?: string | undefined }) {
  if (!message) return null;

  return (
    <p role="alert" aria-live="polite" className="text-sm text-accent">
      {message}
    </p>
  );
}

export function FieldError({ errors }: { errors?: string[] | undefined }) {
  const first = errors?.[0];
  if (!first) return null;

  return (
    <p role="alert" aria-live="assertive" className="text-sm text-accent">
      {first}
    </p>
  );
}
