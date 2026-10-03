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
