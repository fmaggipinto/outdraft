const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** "in 5 days", "in 3 hours", "12 minutes ago". */
export function relative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const [n, unit] =
    abs >= 2 * DAY ? [Math.round(abs / DAY), "day"]
    : abs >= 2 * HOUR ? [Math.round(abs / HOUR), "hour"]
    : [Math.max(1, Math.round(abs / MINUTE)), "minute"];
  const text = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** "Fri 6 Nov, 18:30" in the Viewer's time zone. */
export function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export const pts = (x: number) => x.toFixed(1);

/** 1st, 2nd, 3rd, 11th… */
export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
