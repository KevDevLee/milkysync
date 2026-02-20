import { describe, expect, it } from 'vitest';

import {
  MAX_PUMP_DURATION_SECONDS,
  clampPumpDurationSeconds,
  formatPumpDuration,
  getElapsedPumpDurationSeconds
} from '@/utils/timer';

describe('pump timer utils', () => {
  it('clamps duration to 0..2h', () => {
    expect(clampPumpDurationSeconds(-1)).toBe(0);
    expect(clampPumpDurationSeconds(90.9)).toBe(90);
    expect(clampPumpDurationSeconds(8_000)).toBe(MAX_PUMP_DURATION_SECONDS);
  });

  it('calculates running elapsed duration and caps at 2h', () => {
    const startedAt = 1_700_000_000_000;
    const now = startedAt + 31_000;
    expect(getElapsedPumpDurationSeconds(10, startedAt, now)).toBe(41);

    const maxed = startedAt + 8_000_000;
    expect(getElapsedPumpDurationSeconds(0, startedAt, maxed)).toBe(MAX_PUMP_DURATION_SECONDS);
  });

  it('formats mm:ss and hh:mm:ss', () => {
    expect(formatPumpDuration(75)).toBe('01:15');
    expect(formatPumpDuration(3_661)).toBe('01:01:01');
  });
});
