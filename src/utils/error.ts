export function reportError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    console.error(error);
    return error.message;
  }

  console.error(fallbackMessage, error);
  return fallbackMessage;
}
