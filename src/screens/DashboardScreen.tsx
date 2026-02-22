import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useI18n } from '@/i18n/useI18n';
import { AppTabsParamList } from '@/navigation/types';
import { useAppData } from '@/state/AppDataContext';
import { AppColors, useAppColors } from '@/theme/colors';
import { formatDateTime, formatRelativeDuration, formatTime } from '@/utils/date';
import { computeNextReminderTimestamp } from '@/utils/reminder';

export function DashboardScreen(): React.JSX.Element {
  const { sessions, dailyTotalMl, reminderSettings, loading, refresh } = useAppData();
  const navigation = useNavigation<BottomTabNavigationProp<AppTabsParamList>>();
  const [now, setNow] = useState(Date.now());
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useI18n();

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
      setRefreshError(error instanceof Error ? error.message : t('overview.errorTitle'));
    }
  };

  const lastSession = sessions[0] ?? null;
  const nextReminderAt = useMemo(
    () => computeNextReminderTimestamp(lastSession?.timestamp ?? null, reminderSettings.intervalMinutes, now),
    [lastSession?.timestamp, reminderSettings.intervalMinutes, now]
  );

  const nextReminderLabel = reminderSettings.enabled
    ? formatRelativeDuration(nextReminderAt, now)
    : t('overview.remindersDisabled');

  if (loading) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="loading"
            title={t('overview.loadingTitle')}
            message={t('overview.loadingMessage')}
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
            title={t('overview.errorTitle')}
            message={refreshError}
            actionLabel={t('common.tryAgain')}
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
        <Text style={styles.eyebrow}>{t('overview.today')}</Text>
        <Text style={styles.title}>{dailyTotalMl} ml</Text>
        <Text style={styles.subtitle}>{t('overview.totalPumpedToday')}</Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.eyebrow}>{t('overview.nextReminder')}</Text>
        <Text style={styles.title}>{nextReminderLabel}</Text>
        <Text style={styles.subtitle}>
          {reminderSettings.enabled
            ? `${t('overview.scheduledFor')} ${formatTime(nextReminderAt)} • ${t('overview.everyMinutes', {
                minutes: reminderSettings.intervalMinutes
              })}`
            : t('overview.turnOnInSettings')}
        </Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.eyebrow}>{t('overview.lastSession')}</Text>
        {lastSession ? (
          <>
            <Text style={styles.title}>{`${lastSession.totalMl} ml`}</Text>
            <Text style={styles.subtitle}>{formatDateTime(lastSession.timestamp)}</Text>
          </>
        ) : (
          <StateMessage
            variant="empty"
            title={t('overview.noSessionsYet')}
            message={t('overview.startFirstSession')}
          />
        )}
      </AppCard>

      <AppButton
        label={t('overview.startPumping')}
        onPress={() => navigation.navigate('AddSession')}
        accessibilityLabel={t('overview.startPumping')}
      />
    </Screen>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
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
}
