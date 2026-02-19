import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';

export function SettingsScreen(): React.JSX.Element {
  const { reminderSettings, saveReminderSettings, profile } = useAppData();
  const [intervalInput, setIntervalInput] = useState(String(reminderSettings.intervalMinutes));
  const [enabled, setEnabled] = useState(reminderSettings.enabled);

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

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

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
        <Text style={styles.helper}>Invite code and joining flow will be enabled in Phase E.</Text>
      </View>
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
  savePressed: {
    opacity: 0.85
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  }
});
