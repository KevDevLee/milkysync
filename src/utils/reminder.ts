export function computeNextReminderTimestamp(
  lastSessionTimestamp: number | null,
  intervalMinutes: number,
  now: number = Date.now()
): number {
  if (!lastSessionTimestamp) {
    return now + intervalMinutes * 60 * 1000;
  }

  return lastSessionTimestamp + intervalMinutes * 60 * 1000;
}
