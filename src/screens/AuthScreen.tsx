import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors } from '@/theme/colors';

export function AuthScreen(): React.JSX.Element {
  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to MilkySync</Text>
        <Text style={styles.body}>Phase A: Auth UI placeholder.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary
  }
});
