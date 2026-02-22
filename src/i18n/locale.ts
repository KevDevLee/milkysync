import type { AppLanguage } from '@/services/preferences/AppPreferencesContext';

let currentLanguage: AppLanguage = 'en';

export function setCurrentLanguage(language: AppLanguage): void {
  currentLanguage = language;
}

export function getCurrentLanguage(): AppLanguage {
  return currentLanguage;
}

export function getCurrentIntlLocale(): string {
  return currentLanguage === 'de' ? 'de-DE' : 'en-US';
}
