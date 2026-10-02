export type TimeEntryFeedback = "success" | "error" | null;

export function getTimeEntryFeedback({
  saved,
  actionSucceeded,
  actionFailed,
  pending,
}: {
  saved: boolean;
  actionSucceeded: boolean;
  actionFailed: boolean;
  pending: boolean;
}): TimeEntryFeedback {
  if (pending) return null;
  if (actionFailed) return "error";
  if (saved || actionSucceeded) return "success";
  return null;
}
