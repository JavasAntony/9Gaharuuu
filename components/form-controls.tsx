"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PILL_PRIMARY } from "@/lib/ui";

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
    <button type="submit" disabled={pending} className={`${PILL_PRIMARY} min-h-11 w-full ${className}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ message }: { message?: string | undefined }) {
  if (!message) return null;

  // `rise` is why this does not read as a glitch: a red line that appears where nothing
  // was is easy to miss on a phone, and this is the only signal that a send was refused.
  return (
    <p role="alert" aria-live="polite" className="animate-rise text-sm font-semibold text-accent">
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