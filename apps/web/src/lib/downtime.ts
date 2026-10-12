/** A breakdown's clock, as the API works it out (downtime/downtime.ts). */
export interface BreakdownClock {
  open: boolean;
  /** Reported to now (open) or to put right. */
  hours: number;
  attendHours: number | null;
  limitHours: number;
  /** Negative: over by that much. */
  leftHours: number;
  state: "within" | "nearing" | "over";
}

/** "45 min", "7.5 h", "2 days 4 h". */
export function hoursText(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest ? `${days} days ${rest} h` : `${days} days`;
}

/** A repair limit as BMMP states it: "72 h", "7 days". */
export const limitText = (hours: number) => (hours > 72 && hours % 24 === 0 ? `${hours / 24} days` : `${hours} h`);

/** How a breakdown stands against its repair limit, in a few words. */
export function clockText(c: BreakdownClock): string {
  const limit = limitText(c.limitHours);
  if (c.open) {
    if (c.state === "over") return `Over the ${limit} repair limit by ${hoursText(-c.leftHours)}`;
    if (c.state === "nearing") return `Open ${hoursText(c.hours)}: ${hoursText(c.leftHours)} left of ${limit}`;
    return `Open ${hoursText(c.hours)} · to be put right within ${limit}`;
  }
  return c.state === "over"
    ? `Put right in ${hoursText(c.hours)}, over the ${limit} limit`
    : `Put right in ${hoursText(c.hours)} (limit ${limit})`;
}
