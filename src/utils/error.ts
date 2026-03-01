type ErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function extractMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message || null;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const withMessage = error as ErrorLike;

    if (typeof withMessage.message === 'string' && withMessage.message.trim().length > 0) {
      return withMessage.message;
    }

    const code = typeof withMessage.code === 'string' ? withMessage.code : '';
    const details = typeof withMessage.details === 'string' ? withMessage.details : '';
    const hint = typeof withMessage.hint === 'string' ? withMessage.hint : '';
    const assembled = [code, details, hint].filter(Boolean).join(' · ');
    if (assembled.length > 0) {
      return assembled;
    }
  }

  return null;
}

function humanizeMessage(message: string): string {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('network error')
  ) {
    return 'Network unavailable. Check your internet connection and try again.';
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }

  if (
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('42501')
  ) {
    return 'Permission denied. Please refresh your account or sign in again.';
  }

  if (lower.includes('email rate limit exceeded')) {
    return 'Too many email attempts. Please wait a bit and try again.';
  }

  if (lower.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }

  if (lower.includes('jwt expired') || lower.includes('session') && lower.includes('expired')) {
    return 'Session expired. Please sign in again.';
  }

  if (normalized.length > 220) {
    const firstLine = normalized.split('\n')[0];
    return firstLine.slice(0, 220);
  }

  return normalized;
}

export function reportError(error: unknown, fallbackMessage: string): string {
  const extracted = extractMessage(error);
  const message = extracted ? humanizeMessage(extracted) : fallbackMessage;
  console.warn('Operation failed:', error);
  return message || fallbackMessage;
}
