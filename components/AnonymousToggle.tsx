"use client";

import { useId, useState } from "react";

export function AnonymousToggle({
  defaultChecked = false,
  label = "Kirim secara Anonim",
  hint = "Namamu tidak akan muncul di feed.",
  name = "anonymous",
  compact = false,
}: {
  defaultChecked?: boolean;
  label?: string;
  hint?: string;
  name?: string;
  /** Drops the hint line and tightens the spacing, for the inline composers. */
  compact?: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const id = useId();

  return (
    <div className={`flex items-start gap-3 ${compact ? "-mt-1" : ""}`}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => setChecked((value) => !value)}
        className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
          checked ? "border-accent bg-accent" : "border-line bg-background"
        }`}
      >
        <span
          className={`mx-0.5 size-5 rounded-full transition-transform ${
            checked ? "translate-x-5 bg-white" : "translate-x-0 bg-muted"
          }`}
        />
      </button>

      {/* The switch owns the state; this hidden input is what the Server Action reads. */}
      <input type="hidden" name={name} value={checked ? "true" : "false"} />

      <label htmlFor={id} className="cursor-pointer text-sm leading-snug">
        <span className={compact ? "text-xs" : "font-medium"}>{label}</span>
        {hint && !compact ? <span className="block text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}
