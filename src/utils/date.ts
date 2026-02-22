import { getCurrentIntlLocale, getCurrentLanguage } from '@/i18n/locale';

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function formatRelativeDuration(targetTimestamp: number, now: number): string {
  const diffMs = targetTimestamp - now;
  const absMs = Math.abs(diffMs);
  const minutes = Math.floor(absMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const language = getCurrentLanguage();
  const chunk =
    hours > 0
      ? language === 'de'
        ? `${hours} Std. ${remainingMinutes} Min.`
        : `${hours}h ${remainingMinutes}m`
      : language === 'de'
        ? `${minutes} Min.`
        : `${minutes}m`;

  if (diffMs >= 0) {
    return language === 'de' ? `in ${chunk}` : `in ${chunk}`;
  }

  return language === 'de' ? `vor ${chunk}` : `${chunk} ago`;
}
