export function shouldApplyRemoteUpdate(
  localUpdatedAt: number | null,
  remoteUpdatedAt: number
): boolean {
  if (localUpdatedAt === null) {
    return true;
  }

  return remoteUpdatedAt >= localUpdatedAt;
}
