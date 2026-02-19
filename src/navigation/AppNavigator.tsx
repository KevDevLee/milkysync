import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddSessionScreen } from '@/screens/AddSessionScreen';
import { AuthScreen } from '@/screens/AuthScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

import { AppTabsParamList, AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();
const Tabs = createBottomTabNavigator<AppTabsParamList>();

function AppTabs(): React.JSX.Element {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2f6b62',
        tabBarStyle: {
          height: 62,
          paddingBottom: 8,
          paddingTop: 6
        }
      }}
    >
      <Tabs.Screen name="Home" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tabs.Screen name="AddSession" component={AddSessionScreen} options={{ title: 'Add' }} />
      <Tabs.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tabs.Navigator>
  );
}

export function AppNavigator(): React.JSX.Element {
  const isAuthenticated = true;

  if (isAuthenticated) {
    return <AppTabs />;
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
