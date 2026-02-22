import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

import { setCurrentLanguage } from '@/i18n/locale';

type ThemeMode = 'light' | 'dark';
type AppLanguage = 'de' | 'en';

type AppPreferences = {
  themeMode: ThemeMode;
  language: AppLanguage;
};

type AppPreferencesContextValue = {
  loading: boolean;
  preferences: AppPreferences;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

const STORAGE_KEY = '@milkysync:app_preferences';

const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: 'light',
  language: 'en'
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as Partial<AppPreferences>;

        const nextPreferences: AppPreferences = {
          themeMode: parsed.themeMode === 'dark' ? 'dark' : 'light',
          language: parsed.language === 'de' ? 'de' : 'en'
        };

        if (active) {
          setPreferences(nextPreferences);
        }
      } catch (error) {
        console.warn('Failed to load app preferences.', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setCurrentLanguage(preferences.language);
  }, [preferences.language]);

  const persist = useCallback(async (nextPreferences: AppPreferences): Promise<void> => {
    setPreferences(nextPreferences);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences));
    } catch (error) {
      console.warn('Failed to save app preferences.', error);
    }
  }, []);

  const setThemeMode = useCallback(
    async (mode: ThemeMode): Promise<void> => {
      await persist({ ...preferences, themeMode: mode });
    },
    [persist, preferences]
  );

  const setLanguage = useCallback(
    async (language: AppLanguage): Promise<void> => {
      await persist({ ...preferences, language });
    },
    [persist, preferences]
  );

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      loading,
      preferences,
      setThemeMode,
      setLanguage
    }),
    [loading, preferences, setLanguage, setThemeMode]
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences(): AppPreferencesContextValue {
  const value = useContext(AppPreferencesContext);
  if (!value) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }
  return value;
}

export type { AppLanguage, ThemeMode };
