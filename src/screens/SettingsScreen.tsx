import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native';
import * as Notifications from 'expo-notifications';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppInput } from '@/components/AppInput';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useI18n } from '@/i18n/useI18n';
import { useAuth } from '@/services/auth/AuthContext';
import { familyService } from '@/services/family/FamilyService';
import { useAppPreferences } from '@/services/preferences/AppPreferencesContext';
import { useAppData } from '@/state/AppDataContext';
import { AppColors, useAppColors } from '@/theme/colors';
import { formatDateTime, formatRelativeDuration } from '@/utils/date';
import { reportError } from '@/utils/error';
import { computeNextReminderTimestamp } from '@/utils/reminder';

const REMINDER_MIN_INTERVAL = 30;
const REMINDER_MAX_INTERVAL = 360;
const REMINDER_OPTIONS = Array.from(
  { length: REMINDER_MAX_INTERVAL - REMINDER_MIN_INTERVAL + 1 },
  (_, index) => index + REMINDER_MIN_INTERVAL
);
const WHEEL_ITEM_HEIGHT = 48;
const WHEEL_VISIBLE_ROWS = 3;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const raw = String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

export function SettingsScreen(): React.JSX.Element {
  const { reminderSettings, saveReminderSettings, profile, syncNow, loading, sessions, syncStatus } = useAppData();
  const { signOut, refreshProfile, sessionUserId } = useAuth();
  const { preferences, loading: preferencesLoading, setThemeMode, setLanguage } = useAppPreferences();
  const [intervalInput, setIntervalInput] = useState(String(reminderSettings.intervalMinutes));
  const [enabled, setEnabled] = useState(reminderSettings.enabled);
  const [showReminderWheel, setShowReminderWheel] = useState(false);
  const [draftReminderMinutes, setDraftReminderMinutes] = useState(reminderSettings.intervalMinutes);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState<boolean | null>(null);
  const [notificationPermissionCanAskAgain, setNotificationPermissionCanAskAgain] = useState(true);
  const [notificationPermissionBusy, setNotificationPermissionBusy] = useState(false);
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useI18n();
  const reminderWheelRef = useRef<ScrollView>(null);
  const reminderWheelMomentumRef = useRef(false);
  const reminderIntervalPreview = Math.max(
    REMINDER_MIN_INTERVAL,
    Math.min(REMINDER_MAX_INTERVAL, Math.round(Number(intervalInput)) || reminderSettings.intervalMinutes)
  );

  useEffect(() => {
    setIntervalInput(String(reminderSettings.intervalMinutes));
    setEnabled(reminderSettings.enabled);
    setDraftReminderMinutes(reminderSettings.intervalMinutes);
  }, [reminderSettings.enabled, reminderSettings.intervalMinutes]);

  const refreshNotificationPermissionStatus = useCallback(async (): Promise<void> => {
    try {
      const permissions = await Notifications.getPermissionsAsync();
      setNotificationPermissionGranted(permissions.granted);
      setNotificationPermissionCanAskAgain(permissions.canAskAgain);
    } catch (error) {
      console.warn('Failed to read notification permissions.', error);
      setNotificationPermissionGranted(null);
      setNotificationPermissionCanAskAgain(true);
    }
  }, []);

  useEffect(() => {
    void refreshNotificationPermissionStatus();
  }, [refreshNotificationPermissionStatus]);

  useEffect(() => {
    if (!showReminderWheel) {
      return;
    }

    const timer = setTimeout(() => {
      const clamped = Math.max(
        REMINDER_MIN_INTERVAL,
        Math.min(REMINDER_MAX_INTERVAL, Math.round(draftReminderMinutes))
      );
      const index = REMINDER_OPTIONS.indexOf(clamped);
      if (index >= 0) {
        reminderWheelRef.current?.scrollTo({
          x: 0,
          y: index * WHEEL_ITEM_HEIGHT,
          animated: false
        });
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [draftReminderMinutes, showReminderWheel]);

  const getReminderWheelIndex = (offsetY: number): number => {
    const roughIndex = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
    return Math.max(0, Math.min(roughIndex, REMINDER_OPTIONS.length - 1));
  };

  const onReminderWheelScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const nextIndex = getReminderWheelIndex(event.nativeEvent.contentOffset.y);
    const nextValue = REMINDER_OPTIONS[nextIndex] ?? reminderSettings.intervalMinutes;
    setDraftReminderMinutes(nextValue);
  };

  const openReminderWheel = (): void => {
    const currentValue = Math.max(
      REMINDER_MIN_INTERVAL,
      Math.min(REMINDER_MAX_INTERVAL, Math.round(Number(intervalInput)) || reminderSettings.intervalMinutes)
    );
    setDraftReminderMinutes(currentValue);
    setShowReminderWheel(true);
  };

  const applyReminderWheel = (): void => {
    setIntervalInput(String(draftReminderMinutes));
    setShowReminderWheel(false);
  };

  const lastSession = sessions[0] ?? null;
  const nextReminderTimestamp = enabled
    ? computeNextReminderTimestamp(lastSession?.timestamp ?? null, reminderIntervalPreview)
    : null;

  const syncStatusLabelKey =
    syncStatus.state === 'syncing'
      ? 'settings.syncStatus.syncing'
      : syncStatus.state === 'synced'
        ? 'settings.syncStatus.synced'
        : syncStatus.state === 'error'
          ? 'settings.syncStatus.error'
          : 'settings.syncStatus.idle';

  const onSave = async (): Promise<void> => {
    const intervalMinutes = Math.max(30, Math.min(360, Math.round(Number(intervalInput)) || 120));

    try {
      await saveReminderSettings({ intervalMinutes, enabled });
      Alert.alert(t('common.saved'), t('settings.savedReminderMessage'));
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.saveError')));
    }
  };

  const onGenerateCode = async (): Promise<void> => {
    if (!profile.familyId || !sessionUserId) {
      Alert.alert(t('settings.unavailableTitle'), t('settings.unavailableContext'));
      return;
    }

    try {
      setPairingBusy(true);
      const code = await familyService.generateInviteCode({
        familyId: profile.familyId,
        createdByUserId: sessionUserId
      });
      setGeneratedCode(code);
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.generateCodeError')));
    } finally {
      setPairingBusy(false);
    }
  };

  const onJoinCode = async (): Promise<void> => {
    if (!sessionUserId || !joinCode.trim()) {
      Alert.alert(t('settings.validationTitle'), t('settings.validationJoinCode'));
      return;
    }

    try {
      setPairingBusy(true);
      await familyService.joinFamilyByCode({
        code: joinCode,
        userId: sessionUserId
      });
      await refreshProfile();
      await syncNow();
      Alert.alert(t('common.saved'), t('settings.joinFamilySuccess'));
      setJoinCode('');
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.joinFamilyError')));
    } finally {
      setPairingBusy(false);
    }
  };

  const onSignOut = async (): Promise<void> => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.signOutError')));
    }
  };

  const onSyncNow = async (): Promise<void> => {
    try {
      const ok = await syncNow();
      if (ok) {
        Alert.alert(t('settings.syncSuccessTitle'), t('settings.syncSuccessMessage'));
      } else {
        Alert.alert(t('common.error'), t('settings.syncError'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.syncError')));
    }
  };

  const onExportCsv = async (): Promise<void> => {
    if (sessions.length === 0) {
      Alert.alert(t('common.error'), t('settings.exportCsvEmpty'));
      return;
    }

    try {
      const rows = [...sessions]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((session) =>
          [
            session.id,
            session.timestamp,
            new Date(session.timestamp).toISOString(),
            session.leftMl,
            session.rightMl,
            session.totalMl,
            session.durationSeconds,
            session.note ?? '',
            session.userId,
            session.familyId
          ]
            .map(csvEscape)
            .join(',')
        );

      const csv = [
        'id,timestamp_ms,timestamp_iso,left_ml,right_ml,total_ml,duration_seconds,note,user_id,family_id',
        ...rows
      ].join('\n');

      await Share.share({
        title: 'MilkySync CSV',
        message: csv
      });
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.exportCsvError')));
    }
  };

  const onRequestNotificationPermission = async (): Promise<void> => {
    try {
      setNotificationPermissionBusy(true);
      const result = await Notifications.requestPermissionsAsync();
      setNotificationPermissionGranted(result.granted);
      setNotificationPermissionCanAskAgain(result.canAskAgain);
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.notificationPermissionError')));
    } finally {
      setNotificationPermissionBusy(false);
    }
  };

  const onOpenSystemSettings = async (): Promise<void> => {
    try {
      await Linking.openSettings();
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.notificationOpenSettingsError')));
    }
  };

  const roleLabel = t(`auth.role.${profile.role}`);
  const notificationPermissionStatusKey =
    notificationPermissionGranted === true
      ? 'settings.notificationPermission.statusGranted'
      : notificationPermissionGranted === false
        ? 'settings.notificationPermission.statusDenied'
        : 'settings.notificationPermission.statusUnknown';

  if (loading || preferencesLoading) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="loading"
            title={t('settings.loadingTitle')}
            message={t('settings.loadingMessage')}
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('settings.title')}</Text>

        <AppCard style={styles.card}>
          <Text style={styles.label}>{t('settings.loggedInAs')}</Text>
          <Text style={styles.helper}>{profile.email}</Text>
          <Text style={styles.helper}>
            {t('settings.role')}: {roleLabel}
          </Text>
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.appPreferences')}</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchTextGroup}>
              <Text style={styles.label}>{t('settings.darkMode')}</Text>
              <Text style={styles.helper}>
                {preferences.themeMode === 'dark' ? t('settings.on') : t('settings.off')}
              </Text>
            </View>
            <Switch
              value={preferences.themeMode === 'dark'}
              onValueChange={(value) => {
                void setThemeMode(value ? 'dark' : 'light');
              }}
              trackColor={{ true: colors.primary, false: '#6a7471' }}
              thumbColor={colors.surface}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextGroup}>
              <Text style={styles.label}>{t('settings.languageToggle')}</Text>
              <Text style={styles.helper}>
                {preferences.language === 'de' ? t('settings.language.de') : t('settings.language.en')}
              </Text>
            </View>
            <Switch
              value={preferences.language === 'de'}
              onValueChange={(value) => {
                void setLanguage(value ? 'de' : 'en');
              }}
              trackColor={{ true: colors.primary, false: '#6a7471' }}
              thumbColor={colors.surface}
            />
          </View>

          <Text style={styles.helper}>{t('settings.preferencesHint')}</Text>
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.syncStatusTitle')}</Text>
          <View style={styles.syncStatusRow}>
            <View
              style={[
                styles.syncStatusDot,
                syncStatus.state === 'synced' && styles.syncStatusDotSuccess,
                syncStatus.state === 'syncing' && styles.syncStatusDotWorking,
                syncStatus.state === 'error' && styles.syncStatusDotError
              ]}
            />
            <Text style={styles.label}>{t(syncStatusLabelKey)}</Text>
          </View>
          {syncStatus.lastSyncedAt ? (
            <Text style={styles.helper}>
              {t('settings.lastSyncedAt')}: {formatRelativeDuration(syncStatus.lastSyncedAt, Date.now())} (
              {formatDateTime(syncStatus.lastSyncedAt)})
            </Text>
          ) : null}
          {syncStatus.errorMessage ? <Text style={styles.errorText}>{syncStatus.errorMessage}</Text> : null}

          <AppButton label={t('settings.syncNow')} onPress={() => void onSyncNow()} variant="secondary" />
          <AppButton label={t('settings.exportCsv')} onPress={() => void onExportCsv()} variant="secondary" />
          <Text style={styles.helper}>{t('settings.exportCsvHint', { count: sessions.length })}</Text>
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.notificationsTitle')}</Text>

          <View style={styles.permissionBox}>
            <Text style={styles.fieldLabel}>{t('settings.notificationPermissionTitle')}</Text>
            <Text style={styles.reminderPickerValue}>{t(notificationPermissionStatusKey)}</Text>
            <Text style={styles.helper}>
              {notificationPermissionGranted
                ? t('settings.notificationPermissionGrantedHint')
                : notificationPermissionCanAskAgain
                  ? t('settings.notificationPermissionRequestHint')
                  : t('settings.notificationPermissionOpenSettingsHint')}
            </Text>

            <View style={styles.permissionActionsRow}>
              {notificationPermissionCanAskAgain && notificationPermissionGranted !== true ? (
                <AppButton
                  label={
                    notificationPermissionBusy
                      ? t('common.working')
                      : t('settings.notificationPermissionRequestButton')
                  }
                  onPress={() => void onRequestNotificationPermission()}
                  disabled={notificationPermissionBusy}
                  variant="secondary"
                  style={styles.permissionActionButton}
                />
              ) : null}
              <AppButton
                label={t('settings.notificationOpenSettingsButton')}
                onPress={() => void onOpenSystemSettings()}
                variant="secondary"
                style={styles.permissionActionButton}
              />
              <AppButton
                label={t('settings.notificationPermissionRefreshButton')}
                onPress={() => void refreshNotificationPermissionStatus()}
                variant="secondary"
                style={styles.permissionActionButton}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('settings.reminderEveryMinutes')}</Text>
            <Pressable
              onPress={openReminderWheel}
              accessibilityRole="button"
              accessibilityLabel={t('settings.reminderEveryMinutes')}
              style={({ pressed }) => [
                styles.reminderPickerField,
                pressed && styles.reminderPickerFieldPressed
              ]}
            >
              <Text style={styles.reminderPickerValue}>{intervalInput} min</Text>
              <Text style={styles.reminderPickerHint}>{t('settings.tapToChange')}</Text>
            </Pressable>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('settings.enableReminders')}</Text>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ true: colors.primary, false: '#6a7471' }}
              thumbColor={colors.surface}
            />
          </View>

          {enabled && nextReminderTimestamp ? (
            <View style={styles.reminderPreviewBox}>
              <Text style={styles.reminderPreviewLabel}>{t('settings.nextReminderPreview')}</Text>
              <Text style={styles.reminderPreviewValue}>{formatDateTime(nextReminderTimestamp)}</Text>
              <Text style={styles.helper}>{formatRelativeDuration(nextReminderTimestamp, Date.now())}</Text>
            </View>
          ) : (
            <Text style={styles.helper}>{t('settings.reminderDisabledPreview')}</Text>
          )}

          <Text style={styles.helper}>{t('settings.unitsFixed')}</Text>
          <AppButton label={t('settings.saveSettings')} onPress={() => void onSave()} />
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.partnerPairing')}</Text>
          <Text style={styles.helper}>
            {t('settings.familyId')}: {profile.familyId ?? t('settings.notSet')}
          </Text>

          <AppButton
            label={pairingBusy ? t('common.working') : t('settings.generateInviteCode')}
            onPress={() => void onGenerateCode()}
            disabled={pairingBusy}
            variant="secondary"
          />

          {generatedCode ? (
            <Text style={styles.inviteCode}>
              {t('settings.inviteCode')}: {generatedCode}
            </Text>
          ) : null}

          <AppInput
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder={t('settings.enterInviteCode')}
            autoCapitalize="characters"
          />

          <AppButton
            label={pairingBusy ? t('common.working') : t('settings.joinFamily')}
            onPress={() => void onJoinCode()}
            disabled={pairingBusy}
            variant="secondary"
          />
        </AppCard>

        <AppButton label={t('settings.logOut')} onPress={() => void onSignOut()} variant="danger" />
      </ScrollView>

      <Modal
        visible={showReminderWheel}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReminderWheel(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('settings.reminderEveryMinutes')}</Text>
            <Text style={styles.modalHint}>
              {t('settings.chooseReminderIntervalHint', { min: REMINDER_MIN_INTERVAL, max: REMINDER_MAX_INTERVAL })}
            </Text>

            <View style={styles.wheelRow}>
              <View style={styles.wheelContainer}>
                <ScrollView
                  ref={reminderWheelRef}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  snapToInterval={WHEEL_ITEM_HEIGHT}
                  decelerationRate="fast"
                  contentContainerStyle={styles.wheelContent}
                  onScrollBeginDrag={() => {
                    reminderWheelMomentumRef.current = false;
                  }}
                  onMomentumScrollBegin={() => {
                    reminderWheelMomentumRef.current = true;
                  }}
                  onMomentumScrollEnd={onReminderWheelScrollEnd}
                  onScrollEndDrag={(event) => {
                    if (!reminderWheelMomentumRef.current) {
                      onReminderWheelScrollEnd(event);
                    }
                  }}
                >
                  {REMINDER_OPTIONS.map((value) => (
                    <View key={value} style={styles.wheelItem}>
                      <Text style={[styles.wheelItemText, value === draftReminderMinutes && styles.wheelItemTextActive]}>
                        {value}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                <View pointerEvents="none" style={styles.wheelCenterMarker} />
              </View>
              <Text style={styles.wheelUnit}>min</Text>
            </View>

            <View style={styles.modalActionsRow}>
              <AppButton
                label={t('settings.cancel')}
                onPress={() => setShowReminderWheel(false)}
                variant="secondary"
                style={styles.modalActionButton}
              />
              <AppButton
                label={t('settings.apply')}
                onPress={applyReminderWheel}
                style={styles.modalActionButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    content: {
      paddingBottom: 24
    },
    field: {
      gap: 6
    },
    fieldLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600'
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 12
    },
    card: {
      gap: 10,
      marginBottom: 12
    },
    sectionTitle: {
      fontSize: 18,
      color: colors.textPrimary,
      fontWeight: '700'
    },
    label: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '600'
    },
    switchRow: {
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'space-between',
      flexDirection: 'row',
      gap: 12
    },
    switchTextGroup: {
      flex: 1
    },
    helper: {
      color: colors.textSecondary,
      fontSize: 14
    },
    errorText: {
      color: colors.danger,
      fontSize: 13
    },
    syncStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    syncStatusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.textSecondary
    },
    syncStatusDotSuccess: {
      backgroundColor: colors.primary
    },
    syncStatusDotWorking: {
      backgroundColor: colors.accent
    },
    syncStatusDotError: {
      backgroundColor: colors.danger
    },
    reminderPickerField: {
      minHeight: 54,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      justifyContent: 'center',
      gap: 2
    },
    permissionBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6
    },
    permissionActionsRow: {
      gap: 8,
      marginTop: 2
    },
    permissionActionButton: {
      width: '100%'
    },
    reminderPickerFieldPressed: {
      opacity: 0.86
    },
    reminderPickerValue: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700'
    },
    reminderPickerHint: {
      color: colors.textSecondary,
      fontSize: 13
    },
    reminderPreviewBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2
    },
    reminderPreviewLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600'
    },
    reminderPreviewValue: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700'
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 10
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary
    },
    modalHint: {
      fontSize: 13,
      color: colors.textSecondary
    },
    wheelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginVertical: 4
    },
    wheelContainer: {
      width: 110,
      height: WHEEL_HEIGHT,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden'
    },
    wheelContent: {
      paddingVertical: (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2
    },
    wheelItem: {
      height: WHEEL_ITEM_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center'
    },
    wheelItemText: {
      color: colors.textSecondary,
      fontSize: 24,
      fontWeight: '600',
      opacity: 0.55,
      fontVariant: ['tabular-nums']
    },
    wheelItemTextActive: {
      color: colors.textPrimary,
      fontSize: 30,
      fontWeight: '700',
      opacity: 1
    },
    wheelCenterMarker: {
      position: 'absolute',
      left: 10,
      right: 10,
      top: (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2,
      height: WHEEL_ITEM_HEIGHT,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border
    },
    wheelUnit: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '700'
    },
    modalActionsRow: {
      flexDirection: 'row',
      gap: 10
    },
    modalActionButton: {
      flex: 1
    },
    inviteCode: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 1.2
    }
  });
}
