import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { formatDateTime } from '@/utils/date';

export function HistoryScreen(): React.JSX.Element {
  const { sessions, dailyTotalMl } = useAppData();

  return (
    <Screen>
      <View style={styles.headerCard}>
        <Text style={styles.headerLabel}>Today total</Text>
        <Text style={styles.headerValue}>{dailyTotalMl} ml</Text>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.empty}>No sessions yet. Add one from the Add tab.</Text>}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <Text style={styles.itemTotal}>{item.totalMl} ml</Text>
            <Text style={styles.itemDetail}>
              L {item.leftMl} ml • R {item.rightMl} ml • {formatDateTime(item.timestamp)}
            </Text>
            {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 12,
    gap: 2
  },
  headerLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600'
  },
  headerValue: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '700'
  },
  listContent: {
    paddingBottom: 24
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 4
  },
  itemTotal: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700'
  },
  itemDetail: {
    color: colors.textSecondary,
    fontSize: 14
  },
  itemNote: {
    color: colors.textPrimary,
    fontSize: 14
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16
  }
});
