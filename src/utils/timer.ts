export const MAX_PUMP_DURATION_SECONDS = 2 * 60 * 60;

export function clampPumpDurationSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_PUMP_DURATION_SECONDS, Math.floor(value)));
}

export function getElapsedPumpDurationSeconds(
  baseSeconds: number,
  startedAtMs: number | null,
  nowMs: number = Date.now()
): number {
  if (startedAtMs === null) {
    return clampPumpDurationSeconds(baseSeconds);
  }

  const elapsedFromRunning = Math.floor((nowMs - startedAtMs) / 1000);
  return clampPumpDurationSeconds(baseSeconds + elapsedFromRunning);
}

export function formatPumpDuration(seconds: number): string {
  const safeSeconds = clampPumpDurationSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`;
}
