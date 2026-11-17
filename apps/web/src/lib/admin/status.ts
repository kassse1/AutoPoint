/** Which status buttons to show. Mirrors the API's state machine; the API still decides. */
const TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "no_show", "cancelled"],
  in_progress: ["completed", "cancelled"],
};
const WORK = new Set(["in_progress", "completed"]);

export function nextStatuses(
  current: string,
  opts: { manage: boolean; cancelInProgress: boolean; started: boolean },
) {
  return (TRANSITIONS[current] ?? [])
    .filter((s) => opts.manage || WORK.has(s))
    .filter((s) => !(current === "in_progress" && s === "cancelled" && !opts.cancelInProgress))
    .filter((s) => s !== "no_show" || opts.started)
    .map((status) => ({
      status,
      needsAmount: status === "completed",
      needsReason: status === "cancelled",
    }));
}
