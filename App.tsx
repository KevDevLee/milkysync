import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initializeDatabase } from '@/db/database';
import { AppNavigator } from '@/navigation/AppNavigator';
import { AppDataProvider } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';

export default function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <Text style={styles.loading}>Preparing local storage...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppDataProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </AppDataProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
