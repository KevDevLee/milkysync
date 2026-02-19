import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/services/auth/AuthContext';
import { familyService } from '@/services/family/FamilyService';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';

export function SettingsScreen(): React.JSX.Element {
  const { reminderSettings, saveReminderSettings, profile, syncNow } = useAppData();
  const { signOut, refreshProfile, sessionUserId } = useAuth();
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
      console.error(error);
      Alert.alert('Error', 'Could not save settings.');
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
      console.error(error);
      Alert.alert('Error', 'Could not generate invite code.');
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
      console.error(error);
      const message = error instanceof Error ? error.message : 'Could not join family.';
      Alert.alert('Error', message);
    } finally {
      setPairingBusy(false);
    }
  };

  const onSignOut = async (): Promise<void> => {
    try {
      await signOut();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not sign out.');
    }
  };

  const onSyncNow = async (): Promise<void> => {
    try {
      await syncNow();
      Alert.alert('Synced', 'Local and cloud data are in sync.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Sync failed.');
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Logged in as</Text>
        <Text style={styles.helper}>{profile.email}</Text>
        <Text style={styles.helper}>Role: {profile.role}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Reminder every (minutes)</Text>
        <TextInput
          value={intervalInput}
          onChangeText={setIntervalInput}
          keyboardType="numeric"
          style={styles.input}
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

        <Pressable
          onPress={onSave}
          accessibilityRole="button"
          style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
        >
          <Text style={styles.saveText}>Save Settings</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Partner Pairing</Text>
        <Text style={styles.helper}>Family ID: {profile.familyId ?? 'Not set'}</Text>

        <Pressable
          onPress={onGenerateCode}
          disabled={pairingBusy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.savePressed]}
        >
          <Text style={styles.secondaryText}>
            {pairingBusy ? 'Working...' : 'Generate Invite Code'}
          </Text>
        </Pressable>

        {generatedCode ? <Text style={styles.inviteCode}>Invite Code: {generatedCode}</Text> : null}

        <TextInput
          value={joinCode}
          onChangeText={setJoinCode}
          placeholder="Enter invite code"
          autoCapitalize="characters"
          style={styles.input}
        />

        <Pressable
          onPress={onJoinCode}
          disabled={pairingBusy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.savePressed]}
        >
          <Text style={styles.secondaryText}>{pairingBusy ? 'Working...' : 'Join Family'}</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onSyncNow}
        accessibilityRole="button"
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.savePressed]}
      >
        <Text style={styles.secondaryText}>Sync Now</Text>
      </Pressable>

      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        style={({ pressed }) => [styles.logoutButton, pressed && styles.savePressed]}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 14,
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
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontSize: 16
  },
  switchRow: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row'
  },
  helper: {
    color: colors.textSecondary,
    fontSize: 14
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12
  },
  secondaryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700'
  },
  inviteCode: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1.2
  },
  savePressed: {
    opacity: 0.85
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  logoutButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#c35b5b',
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  }
});
