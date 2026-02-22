import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { AppTabsParamList } from '@/navigation/types';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { formatDateTime, formatRelativeDuration, formatTime } from '@/utils/date';
import { computeNextReminderTimestamp } from '@/utils/reminder';

export function DashboardScreen(): React.JSX.Element {
  const { sessions, dailyTotalMl, reminderSettings, loading, refresh } = useAppData();
  const navigation = useNavigation<BottomTabNavigationProp<AppTabsParamList>>();
  const [now, setNow] = useState(Date.now());
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const onRetry = async (): Promise<void> => {
    try {
      setRefreshError(null);
      await refresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Could not refresh overview.');
    }
  };

  const lastSession = sessions[0] ?? null;
  const nextReminderAt = useMemo(
    () => computeNextReminderTimestamp(lastSession?.timestamp ?? null, reminderSettings.intervalMinutes, now),
    [lastSession?.timestamp, reminderSettings.intervalMinutes, now]
  );

  const nextReminderLabel = reminderSettings.enabled
    ? formatRelativeDuration(nextReminderAt, now)
    : 'Reminders disabled';

  if (loading) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="loading"
            title="Loading overview..."
            message="We are preparing your latest data."
          />
        </AppCard>
      </Screen>
    );
  }

  if (refreshError) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="error"
            title="Could not load overview"
            message={refreshError}
            actionLabel="Try again"
            onAction={() => {
              void onRetry();
            }}
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppCard style={styles.card}>
        <Text style={styles.eyebrow}>Today</Text>
        <Text style={styles.title}>{dailyTotalMl} ml</Text>
        <Text style={styles.subtitle}>Total pumped today</Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.eyebrow}>Next reminder</Text>
        <Text style={styles.title}>{nextReminderLabel}</Text>
        <Text style={styles.subtitle}>
          {reminderSettings.enabled
            ? `Scheduled for ${formatTime(nextReminderAt)} • Every ${reminderSettings.intervalMinutes} minutes`
            : 'Turn reminders on in Settings'}
        </Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.eyebrow}>Last session</Text>
        {lastSession ? (
          <>
            <Text style={styles.title}>{`${lastSession.totalMl} ml`}</Text>
            <Text style={styles.subtitle}>{formatDateTime(lastSession.timestamp)}</Text>
          </>
        ) : (
          <StateMessage
            variant="empty"
            title="No sessions yet"
            message="Start your first pump session from the Start tab."
          />
        )}
      </AppCard>

      <AppButton
        label="Start Pumping"
        onPress={() => navigation.navigate('AddSession')}
        accessibilityLabel="Open start pumping screen"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
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
  }
});
