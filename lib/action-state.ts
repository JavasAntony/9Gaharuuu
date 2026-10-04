export type ActionState = {
  /** Field-level validation messages, keyed by input name. */
  fieldErrors?: Record<string, string[]>;
  /** Form-level message for the aria-live region. */
  message?: string;
  /**
   * Fresh random value on success. Used as a React `key` so a controlled
   * composer remounts and empties itself without a setState-in-effect.
   */
  successToken?: string;
};

export const IDLE: ActionState = {};

/**
 * For actions called from a menu or a dialog rather than from a `<form>`.
 *
 * There is no field to hang an error on and no remount to clear, so the result carries
 * one message the caller decides how to show -- inline in a dialog, or nowhere at all
 * when the caller has already moved on.
 */
export type ActionResult = { ok: true } | { ok: false; message: string };
