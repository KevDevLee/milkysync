import { describe, expect, it } from 'vitest';

import { clampMl, computeTotalMl } from '@/utils/pump';

describe('pump utils', () => {
  it('clamps invalid values to zero', () => {
    expect(clampMl(-4)).toBe(0);
    expect(clampMl(Number.NaN)).toBe(0);
  });

  it('rounds and sums left/right values', () => {
    expect(computeTotalMl(10.2, 20.7)).toBe(31);
  });
});
