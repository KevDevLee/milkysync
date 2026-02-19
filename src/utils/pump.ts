export function clampMl(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function computeTotalMl(leftMl: number, rightMl: number): number {
  return clampMl(leftMl) + clampMl(rightMl);
}
