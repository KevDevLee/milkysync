import { describe, expect, it } from 'vitest';

import { shouldApplyRemoteUpdate } from '@/utils/conflict';

describe('shouldApplyRemoteUpdate', () => {
  it('applies remote updates when local record does not exist', () => {
    expect(shouldApplyRemoteUpdate(null, 100)).toBe(true);
  });

  it('applies remote updates when timestamp is newer or equal', () => {
    expect(shouldApplyRemoteUpdate(100, 101)).toBe(true);
    expect(shouldApplyRemoteUpdate(100, 100)).toBe(true);
  });

  it('skips remote updates when local timestamp is newer', () => {
    expect(shouldApplyRemoteUpdate(200, 199)).toBe(false);
  });
});
