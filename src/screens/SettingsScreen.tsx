import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppInput } from '@/components/AppInput';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/services/auth/AuthContext';
import { familyService } from '@/services/family/FamilyService';
import { useAppPreferences } from '@/services/preferences/AppPreferencesContext';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { reportError } from '@/utils/error';

export function SettingsScreen(): React.JSX.Element {
  const { reminderSettings, saveReminderSettings, profile, syncNow, loading } = useAppData();
  const { signOut, refreshProfile, sessionUserId } = useAuth();
  const {
    preferences,
    loading: preferencesLoading,
    setThemeMode,
    setLanguage
  } = useAppPreferences();
  const [intervalInput, setIntervalInput] = useState(String(reminderSettings.intervalMinutes));
  const [enabled, setEnabled] = useState(reminderSettings.enabled);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);

  useEffect(() => {
    setIntervalInput(String(reminderSettings.intervalMinutes));
    setEnabled(reminderSettings.enabled);
  }, [reminderSettings.enabled, reminderSettings.intervalMinutes]);

  const onSave = async (): Promise<void> => {
    const intervalMinutes = Math.max(30, Math.min(360, Math.round(Number(intervalInput)) || 120));

    try {
      await saveReminderSettings({ intervalMinutes, enabled });
      Alert.alert('Saved', 'Reminder settings updated.');
    } catch (error) {
      Alert.alert('Error', reportError(error, 'Could not save settings.'));
    }
  };

  const onGenerateCode = async (): Promise<void> => {
    if (!profile.familyId || !sessionUserId) {
      Alert.alert('Unavailable', 'No family/user context available.');
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
      Alert.alert('Error', reportError(error, 'Could not generate invite code.'));
    } finally {
      setPairingBusy(false);
    }
  };

  const onJoinCode = async (): Promise<void> => {
    if (!sessionUserId || !joinCode.trim()) {
      Alert.alert('Validation', 'Enter an invite code to join a family.');
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
      Alert.alert('Success', 'You are now paired with the family.');
      setJoinCode('');
    } catch (error) {
      Alert.alert('Error', reportError(error, 'Could not join family.'));
    } finally {
      setPairingBusy(false);
    }
  };

  const onSignOut = async (): Promise<void> => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Error', reportError(error, 'Could not sign out.'));
    }
  };

  const onSyncNow = async (): Promise<void> => {
    try {
      await syncNow();
      Alert.alert('Synced', 'Local and cloud data are in sync.');
    } catch (error) {
      Alert.alert('Error', reportError(error, 'Sync failed.'));
    }
  };

  if (loading || preferencesLoading) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="loading"
            title="Loading settings..."
            message="We are preparing your account and app settings."
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      <AppCard style={styles.card}>
        <Text style={styles.label}>Logged in as</Text>
        <Text style={styles.helper}>{profile.email}</Text>
        <Text style={styles.helper}>Role: {profile.role}</Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>App Preferences</Text>

        <View style={styles.switchRow}>
          <View style={styles.switchTextGroup}>
            <Text style={styles.label}>Dark mode</Text>
            <Text style={styles.helper}>
              {preferences.themeMode === 'dark' ? 'On' : 'Off'}
            </Text>
          </View>
          <Switch
            value={preferences.themeMode === 'dark'}
            onValueChange={(value) => {
              void setThemeMode(value ? 'dark' : 'light');
            }}
            trackColor={{ true: colors.primary, false: '#d4d8d7' }}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchTextGroup}>
            <Text style={styles.label}>Language (DE / EN)</Text>
            <Text style={styles.helper}>
              {preferences.language === 'de' ? 'Deutsch' : 'English'}
            </Text>
          </View>
          <Switch
            value={preferences.language === 'de'}
            onValueChange={(value) => {
              void setLanguage(value ? 'de' : 'en');
            }}
            trackColor={{ true: colors.primary, false: '#d4d8d7' }}
          />
        </View>

        <Text style={styles.helper}>
          Preferences are saved locally. Full app-wide dark mode and translations can be connected next.
        </Text>
      </AppCard>

      <AppCard style={styles.card}>
        <AppInput
          label="Reminder every (minutes)"
          value={intervalInput}
          onChangeText={setIntervalInput}
          keyboardType="numeric"
          accessibilityLabel="Reminder interval in minutes"
        />

        <View style={styles.switchRow}>
          <Text style={styles.label}>Enable reminders</Text>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ true: colors.primary, false: '#d4d8d7' }}
          />
        </View>

        <Text style={styles.helper}>Units: ml (fixed for MVP)</Text>
        <AppButton label="Save Settings" onPress={() => void onSave()} />
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>Partner Pairing</Text>
        <Text style={styles.helper}>Family ID: {profile.familyId ?? 'Not set'}</Text>

        <AppButton
          label={pairingBusy ? 'Working...' : 'Generate Invite Code'}
          onPress={() => void onGenerateCode()}
          disabled={pairingBusy}
          variant="secondary"
        />

        {generatedCode ? <Text style={styles.inviteCode}>Invite Code: {generatedCode}</Text> : null}

        <AppInput
          value={joinCode}
          onChangeText={setJoinCode}
          placeholder="Enter invite code"
          autoCapitalize="characters"
        />

        <AppButton
          label={pairingBusy ? 'Working...' : 'Join Family'}
          onPress={() => void onJoinCode()}
          disabled={pairingBusy}
          variant="secondary"
        />
      </AppCard>

      <AppButton label="Sync Now" onPress={() => void onSyncNow()} variant="secondary" />
      <AppButton label="Log Out" onPress={() => void onSignOut()} variant="danger" />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
