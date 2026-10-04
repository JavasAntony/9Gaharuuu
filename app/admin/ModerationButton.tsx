"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PILL_GHOST, PILL_PRIMARY } from "@/lib/ui";

/**
 * Submit button for a moderation form.
 *
 * It reads `useFormStatus`, so it must be rendered inside its own `<form>`: the
 * pending flag is per-form, which is what lets one report row run several
 * actions without any of them disabling the others.
 *
 * `disabled` is for a genuinely impossible action, never for "the last one
 * failed": an error is shown next to the form and cleared by the next
 * submission, so a moderator can correct the situation and try again without
 * reloading the page.
 *
 * `tone="danger"` is the filled pill, because the palette's only saturated colour
 * is the accent and a destructive action is exactly what that colour should be
 * spent on. The review actions stay outlined so a queue can be skimmed.
 *
 * `className` exists for width, not for colour. The accent is spent on at most one
 * action per screen, and letting a call site append its own background is how two
 * things end up fighting over it.
 */
export function ModerationButton({
  children,
  pendingLabel,
  tone = "default",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  pendingLabel: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();

  const toneClass = tone === "danger" ? PILL_PRIMARY : PILL_GHOST;

  return (
    <button type="submit" disabled={pending || disabled} className={`${toneClass} ${className}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}