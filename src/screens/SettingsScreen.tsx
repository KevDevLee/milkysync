import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

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

export function SettingsScreen(): React.JSX.Element {
  const { reminderSettings, saveReminderSettings, profile, syncNow, loading } = useAppData();
  const { signOut, refreshProfile, sessionUserId } = useAuth();
  const { preferences, loading: preferencesLoading, setThemeMode, setLanguage } = useAppPreferences();
  const [intervalInput, setIntervalInput] = useState(String(reminderSettings.intervalMinutes));
  const [enabled, setEnabled] = useState(reminderSettings.enabled);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useI18n();

  useEffect(() => {
    setIntervalInput(String(reminderSettings.intervalMinutes));
    setEnabled(reminderSettings.enabled);
  }, [reminderSettings.enabled, reminderSettings.intervalMinutes]);

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
        <AppInput
          label={t('settings.reminderEveryMinutes')}
          value={intervalInput}
          onChangeText={setIntervalInput}
          keyboardType="numeric"
          accessibilityLabel={t('settings.reminderEveryMinutes')}
        />

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
    </Screen>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
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
    inviteCode: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 1.2
    }
  });
}
