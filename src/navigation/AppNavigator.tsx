import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { useI18n } from '@/i18n/useI18n';
import { AddSessionScreen } from '@/screens/AddSessionScreen';
import { AuthScreen } from '@/screens/AuthScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuth } from '@/services/auth/AuthContext';
import { AppDataProvider } from '@/state/AppDataContext';
import { AppColors, useAppColors } from '@/theme/colors';

import { AppTabsParamList, AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();
const Tabs = createBottomTabNavigator<AppTabsParamList>();

function tabIconNameForRoute(routeName: keyof AppTabsParamList, focused: boolean): keyof typeof Ionicons.glyphMap {
  if (routeName === 'AddSession') {
    return focused ? 'timer' : 'timer-outline';
  }
  if (routeName === 'Overview') {
    return focused ? 'speedometer' : 'speedometer-outline';
  }
  if (routeName === 'History') {
    return focused ? 'analytics' : 'analytics-outline';
  }
  return focused ? 'settings' : 'settings-outline';
}

function AppTabs(): React.JSX.Element {
  const colors = useAppColors();
  const { t } = useI18n();

  return (
    <Tabs.Navigator
      initialRouteName="AddSession"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600'
        },
        tabBarStyle: {
          height: 70,
          paddingBottom: 8,
          paddingTop: 8,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          backgroundColor: colors.surface
        },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={tabIconNameForRoute(route.name, focused)} color={color} size={size + 1} />
        )
      })}
    >
      <Tabs.Screen name="AddSession" component={AddSessionScreen} options={{ title: t('tabs.start') }} />
      <Tabs.Screen name="Overview" component={DashboardScreen} options={{ title: t('tabs.overview') }} />
      <Tabs.Screen name="History" component={HistoryScreen} options={{ title: t('tabs.history') }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ title: t('tabs.settings') }} />
    </Tabs.Navigator>
  );
}

export function AppNavigator(): React.JSX.Element {
  const { loading, sessionUserId, profile } = useAuth();
  const colors = useAppColors();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>{t('auth.checkingSession')}</Text>
      </View>
    );
  }

  if (!sessionUserId || !profile) {
    return (
      <Stack.Navigator>
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    );
  }

  return (
    <AppDataProvider profile={profile}>
      <AppTabs />
    </AppDataProvider>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      gap: 8
    },
    text: {
      color: colors.textSecondary,
      fontSize: 15
    }
  });
}
