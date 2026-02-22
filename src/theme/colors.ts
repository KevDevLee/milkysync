import { useMemo } from 'react';
import { Theme as NavigationTheme } from '@react-navigation/native';

import { useAppPreferences } from '@/services/preferences/AppPreferencesContext';

export type AppColors = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  accent: string;
  border: string;
  danger: string;
  chartSurface: string;
};

export const lightColors: AppColors = {
  background: '#f7fbf8',
  surface: '#ffffff',
  textPrimary: '#15332d',
  textSecondary: '#5f7570',
  primary: '#2f6b62',
  accent: '#f4b860',
  border: '#d9e5df',
  danger: '#b74f4f',
  chartSurface: '#f9fcfa'
};

export const darkColors: AppColors = {
  background: '#0f1715',
  surface: '#182321',
  textPrimary: '#ebf4f1',
  textSecondary: '#a7beb8',
  primary: '#58a796',
  accent: '#efbe6a',
  border: '#2a3a36',
  danger: '#e07373',
  chartSurface: '#111b19'
};

export const colors = lightColors;

export function useAppColors(): AppColors {
  const { preferences } = useAppPreferences();
  return preferences.themeMode === 'dark' ? darkColors : lightColors;
}

export function useNavigationTheme(): NavigationTheme {
  const palette = useAppColors();

  return useMemo<NavigationTheme>(
    () => ({
      dark: palette === darkColors,
      colors: {
        primary: palette.primary,
        background: palette.background,
        card: palette.surface,
        text: palette.textPrimary,
        border: palette.border,
        notification: palette.danger
      },
      fonts: {
        regular: {
          fontFamily: 'System',
          fontWeight: '400'
        },
        medium: {
          fontFamily: 'System',
          fontWeight: '500'
        },
        bold: {
          fontFamily: 'System',
          fontWeight: '700'
        },
        heavy: {
          fontFamily: 'System',
          fontWeight: '800'
        }
      }
    }),
    [palette]
  );
}
