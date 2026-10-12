import type { ChecklistAnswer, ChecklistItem, ItemResult, PmOutcome } from "./api/checklists";

/**
 * How a checklist's answers add up, as the API works it out
 * (apps/api/src/pm/checklists.ts): a reading with limits decides for
 * itself, and the outcome is the worst item.
 */
export function itemResult(item: ChecklistItem, answer: ChecklistAnswer | undefined): ItemResult | undefined {
  if (item.kind !== "reading" || answer?.result === "NA") return answer?.result;
  if (typeof answer?.reading !== "number" || !Number.isFinite(answer.reading)) return undefined;
  if (item.min === undefined && item.max === undefined) return answer.result;
  const within =
    (item.min === undefined || answer.reading >= item.min) && (item.max === undefined || answer.reading <= item.max);
  return !within ? "FAIL" : answer.result === "FLAG" ? "FLAG" : "PASS";
}

export function outcomeOf(results: Array<ItemResult | undefined>): PmOutcome {
  return results.includes("FAIL") ? "FAIL" : results.includes("FLAG") ? "FLAG" : "PASS";
}

/** "95 to 99 %", "at most 15 s", "at least 82 %". */
export function rangeText(item: ChecklistItem): string | null {
  const unit = item.unit ? ` ${item.unit}` : "";
  if (item.min !== undefined && item.max !== undefined) return `${item.min} to ${item.max}${unit}`;
  if (item.max !== undefined) return `at most ${item.max}${unit}`;
  if (item.min !== undefined) return `at least ${item.min}${unit}`;
  return null;
}

/** What still needs doing before the checklist can be saved, by item key. */
export function checklistErrors(items: ChecklistItem[], answers: Record<string, ChecklistAnswer>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of items) {
    const a = answers[item.key];
    const result = itemResult(item, a);
    if (item.kind === "reading" && a?.result !== "NA" && typeof a?.reading !== "number") {
      errors[item.key] = "Enter the reading";
    } else if (!result) {
      errors[item.key] = "Choose pass, flag, fail or not applicable";
    } else if ((result === "FLAG" || result === "FAIL") && (a?.note?.trim().length ?? 0) < 3) {
      errors[item.key] = "Say what was found";
    }
  }
  return errors;
}
