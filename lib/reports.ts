/**
 * Report reasons. The slug is what the database `CHECK` constraint accepts and
 * what travels over the wire; the label is Indonesian and only ever rendered.
 */
export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Pelecehan" },
  { value: "bullying", label: "Perundungan (bullying)" },
  { value: "inappropriate", label: "Konten tidak pantas" },
  { value: "hate", label: "Ujaran kebencian atau penyalahgunaan" },
  { value: "other", label: "Lainnya" },
] as const;

export const REPORT_REASON_VALUES = REPORT_REASONS.map((reason) => reason.value);

/** The states a report moves through, in the order the dashboard lists them. */
export const REPORT_STATUSES = [
  { value: "pending", label: "Menunggu" },
  { value: "reviewing", label: "Ditinjau" },
  { value: "resolved", label: "Selesai" },
  { value: "dismissed", label: "Diabaikan" },
] as const;

/** The transitions a moderator may make. `pending` is not reachable on purpose. */
export const REPORT_ACTIONS = [
  { value: "reviewing", label: "Tandai ditinjau" },
  { value: "resolved", label: "Selesaikan" },
  { value: "dismissed", label: "Abaikan" },
] as const;

export function reportReasonLabel(value: string): string {
  return REPORT_REASONS.find((reason) => reason.value === value)?.label ?? value;
}

export function reportStatusLabel(value: string): string {
  return REPORT_STATUSES.find((status) => status.value === value)?.label ?? value;
}