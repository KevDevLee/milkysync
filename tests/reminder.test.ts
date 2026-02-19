import { describe, expect, it } from 'vitest';

import { computeNextReminderTimestamp } from '@/utils/reminder';

describe('computeNextReminderTimestamp', () => {
  it('uses last session timestamp when available', () => {
    const lastSession = 1_700_000_000_000;
    const result = computeNextReminderTimestamp(lastSession, 120);
    expect(result).toBe(lastSession + 7_200_000);
  });

  it('falls back to now when no last session exists', () => {
    const now = 1_700_000_000_000;
    const result = computeNextReminderTimestamp(null, 120, now);
    expect(result).toBe(now + 7_200_000);
  });
});
