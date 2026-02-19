import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors } from '@/theme/colors';

export function AddSessionScreen(): React.JSX.Element {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Add Pump Session</Text>
        <Text style={styles.subtitle}>Local form and save will be wired in Phase C.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 8
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary
  }
});
