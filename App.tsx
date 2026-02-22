import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializeDatabase } from '@/db/database';
import { useI18n } from '@/i18n/useI18n';
import { AppNavigator } from '@/navigation/AppNavigator';
import { AuthProvider } from '@/services/auth/AuthContext';
import { AppPreferencesProvider, useAppPreferences } from '@/services/preferences/AppPreferencesContext';
import { AppColors, useAppColors, useNavigationTheme } from '@/theme/colors';

function AppContent(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { preferences } = useAppPreferences();
  const colors = useAppColors();
  const navigationTheme = useNavigationTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    initializeDatabase()
      .then(() => {
        setReady(true);
      })
      .catch((initError: unknown) => {
        console.error(initError);
        setError('Could not initialize local data storage.');
      });
  }, []);

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loading}>{t('common.loading')}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <AuthProvider>
          <StatusBar style={preferences.themeMode === 'dark' ? 'light' : 'dark'} />
          <AppNavigator />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App(): React.JSX.Element {
  return (
    <AppPreferencesProvider>
      <AppContent />
    </AppPreferencesProvider>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      gap: 12,
      paddingHorizontal: 24
    },
    loading: {
      color: colors.textSecondary,
      fontSize: 16
    },
    error: {
      color: colors.danger,
      fontSize: 16,
      textAlign: 'center'
    }
  });
}
