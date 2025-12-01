import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges an arbitrary list of class names into a deduplicated Tailwind string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number for UI display using the configured locale (default en-US).
 * Keeping this helper colocated allows easy re-use across dashboard cards.
 */
export function formatNumber(value: number, locale: string = "en-US") {
  return new Intl.NumberFormat(locale).format(value);
}
