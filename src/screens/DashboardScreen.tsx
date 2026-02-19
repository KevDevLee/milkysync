import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { formatDateTime, formatRelativeDuration, formatTime } from '@/utils/date';
import { computeNextReminderTimestamp } from '@/utils/reminder';

export function DashboardScreen(): React.JSX.Element {
  const { sessions, dailyTotalMl, addSession, reminderSettings } = useAppData();
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const lastSession = sessions[0] ?? null;
  const nextReminderAt = useMemo(
    () => computeNextReminderTimestamp(lastSession?.timestamp ?? null, reminderSettings.intervalMinutes, now),
    [lastSession?.timestamp, reminderSettings.intervalMinutes, now]
  );

  const nextReminderLabel = reminderSettings.enabled
    ? formatRelativeDuration(nextReminderAt, now)
    : 'Reminders disabled';

  const onQuickAdd = async (): Promise<void> => {
    if (submitting) return;

    try {
      setSubmitting(true);
      await addSession({
        leftMl: 30,
        rightMl: 30,
        timestamp: Date.now(),
        note: 'Quick add'
      });
      Alert.alert('Saved', 'Quick session added.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not add quick session.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Today</Text>
        <Text style={styles.title}>{dailyTotalMl} ml</Text>
        <Text style={styles.subtitle}>Total pumped today</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>Next reminder</Text>
        <Text style={styles.title}>{nextReminderLabel}</Text>
        <Text style={styles.subtitle}>
          {reminderSettings.enabled
            ? `Scheduled for ${formatTime(nextReminderAt)} • Every ${reminderSettings.intervalMinutes} minutes`
            : 'Turn reminders on in Settings'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>Last session</Text>
        <Text style={styles.title}>{lastSession ? `${lastSession.totalMl} ml` : 'No sessions yet'}</Text>
        <Text style={styles.subtitle}>
          {lastSession ? formatDateTime(lastSession.timestamp) : 'Add your first pump session'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick add pumping session"
        onPress={onQuickAdd}
        disabled={submitting}
        style={({ pressed }) => [styles.quickAddButton, pressed && styles.quickAddButtonPressed]}
      >
        <Text style={styles.quickAddText}>{submitting ? 'Saving...' : 'Quick add 30/30 ml'}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 4
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600'
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15
  },
  quickAddButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  quickAddButtonPressed: {
    opacity: 0.85
  },
  quickAddText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16
  }
});
