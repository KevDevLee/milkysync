import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from 'react-native';

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
import { reportError } from '@/utils/error';

const REMINDER_MIN_INTERVAL = 30;
const REMINDER_MAX_INTERVAL = 360;
const REMINDER_OPTIONS = Array.from(
  { length: REMINDER_MAX_INTERVAL - REMINDER_MIN_INTERVAL + 1 },
  (_, index) => index + REMINDER_MIN_INTERVAL
);
const WHEEL_ITEM_HEIGHT = 48;
const WHEEL_VISIBLE_ROWS = 3;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;

export function SettingsScreen(): React.JSX.Element {
  const { reminderSettings, saveReminderSettings, profile, syncNow, loading } = useAppData();
  const { signOut, refreshProfile, sessionUserId } = useAuth();
  const { preferences, loading: preferencesLoading, setThemeMode, setLanguage } = useAppPreferences();
  const [intervalInput, setIntervalInput] = useState(String(reminderSettings.intervalMinutes));
  const [enabled, setEnabled] = useState(reminderSettings.enabled);
  const [showReminderWheel, setShowReminderWheel] = useState(false);
  const [draftReminderMinutes, setDraftReminderMinutes] = useState(reminderSettings.intervalMinutes);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useI18n();
  const reminderWheelRef = useRef<ScrollView>(null);
  const reminderWheelMomentumRef = useRef(false);

  useEffect(() => {
    setIntervalInput(String(reminderSettings.intervalMinutes));
    setEnabled(reminderSettings.enabled);
    setDraftReminderMinutes(reminderSettings.intervalMinutes);
  }, [reminderSettings.enabled, reminderSettings.intervalMinutes]);

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
      await syncNow();
      Alert.alert(t('settings.syncSuccessTitle'), t('settings.syncSuccessMessage'));
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('settings.syncError')));
    }
  };

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
            {t('settings.role')}: {profile.role}
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

        <AppButton label={t('settings.syncNow')} onPress={() => void onSyncNow()} variant="secondary" />
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
