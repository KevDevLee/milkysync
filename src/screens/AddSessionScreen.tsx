import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { Screen } from '@/components/Screen';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { reportError } from '@/utils/error';
import { clampMl } from '@/utils/pump';
import {
  formatPumpDuration,
  getElapsedPumpDurationSeconds,
  MAX_PUMP_DURATION_SECONDS
} from '@/utils/timer';

export function AddSessionScreen(): React.JSX.Element {
  const { addSession } = useAppData();
  const [leftMlInput, setLeftMlInput] = useState('0');
  const [rightMlInput, setRightMlInput] = useState('0');
  const [note, setNote] = useState('');
  const [timestamp, setTimestamp] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartedAtMs, setTimerStartedAtMs] = useState<number | null>(null);
  const [timerBaseSeconds, setTimerBaseSeconds] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());

  const elapsedDurationSeconds = getElapsedPumpDurationSeconds(
    timerBaseSeconds,
    timerRunning ? timerStartedAtMs : null,
    nowMs
  );

  useEffect(() => {
    if (!timerRunning) {
      return;
    }

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      clearInterval(interval);
    };
  }, [timerRunning]);

  useEffect(() => {
    if (!timerRunning || elapsedDurationSeconds < MAX_PUMP_DURATION_SECONDS) {
      return;
    }

    setTimerRunning(false);
    setTimerBaseSeconds(MAX_PUMP_DURATION_SECONDS);
    setTimerStartedAtMs(null);
  }, [elapsedDurationSeconds, timerRunning]);

  const onStartTimer = (): void => {
    if (timerRunning) {
      return;
    }

    if (timerBaseSeconds >= MAX_PUMP_DURATION_SECONDS) {
      Alert.alert('Timer limit', 'Maximum duration is 2 hours. Reset to start again.');
      return;
    }

    setNowMs(Date.now());
    setTimerRunning(true);
    setTimerStartedAtMs(Date.now());
  };

  const onStopTimer = (): void => {
    if (!timerRunning) {
      return;
    }

    setTimerBaseSeconds(elapsedDurationSeconds);
    setTimerRunning(false);
    setTimerStartedAtMs(null);
  };

  const onResetTimer = (): void => {
    setTimerRunning(false);
    setTimerStartedAtMs(null);
    setTimerBaseSeconds(0);
    setNowMs(Date.now());
  };

  const onSave = async (): Promise<void> => {
    const leftMl = clampMl(Number(leftMlInput));
    const rightMl = clampMl(Number(rightMlInput));

    if (leftMl === 0 && rightMl === 0) {
      Alert.alert('Validation', 'Enter at least one non-zero amount.');
      return;
    }

    try {
      setSaving(true);
      const durationSeconds = elapsedDurationSeconds;

      await addSession({
        leftMl,
        rightMl,
        durationSeconds,
        note: note.trim() || undefined,
        timestamp: timestamp.getTime()
      });

      setLeftMlInput('0');
      setRightMlInput('0');
      setNote('');
      setTimestamp(new Date());
      onResetTimer();
      Alert.alert('Saved', 'Pump session stored locally.');
    } catch (error) {
      Alert.alert('Error', reportError(error, 'Unable to save session right now.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add Pump Session</Text>

        <View style={styles.row}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Left (ml)</Text>
            <TextInput
              value={leftMlInput}
              onChangeText={setLeftMlInput}
              keyboardType="numeric"
              style={styles.input}
              accessibilityLabel="Left milk amount in milliliters"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Right (ml)</Text>
            <TextInput
              value={rightMlInput}
              onChangeText={setRightMlInput}
              keyboardType="numeric"
              style={styles.input}
              accessibilityLabel="Right milk amount in milliliters"
            />
          </View>
        </View>

        <Text style={styles.label}>Pumping Timer</Text>
        <View style={styles.timerCard}>
          <Text style={styles.timerValue}>{formatPumpDuration(elapsedDurationSeconds)}</Text>
          <Text style={styles.timerHint}>Max 02:00:00</Text>

          <View style={styles.timerActionsRow}>
            <Pressable
              onPress={timerRunning ? onStopTimer : onStartTimer}
              accessibilityRole="button"
              style={({ pressed }) => [styles.timerButton, pressed && styles.timerPressed]}
            >
              <Text style={styles.timerButtonText}>{timerRunning ? 'Stop' : 'Start'}</Text>
            </Pressable>
            <Pressable
              onPress={onResetTimer}
              accessibilityRole="button"
              style={({ pressed }) => [styles.timerButtonSecondary, pressed && styles.timerPressed]}
            >
              <Text style={styles.timerButtonSecondaryText}>Reset</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.label}>Session Time</Text>
        <Pressable
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.input, styles.datetimeButton, pressed && styles.datetimePressed]}
        >
          <Text style={styles.datetimeText}>{timestamp.toLocaleString()}</Text>
        </Pressable>

        {showPicker && (
          <DateTimePicker
            value={timestamp}
            mode="datetime"
            onChange={(_, nextValue) => {
              if (Platform.OS !== 'ios') {
                setShowPicker(false);
              }
              if (nextValue) {
                setTimestamp(nextValue);
              }
            }}
          />
        )}

        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Any details to remember"
          style={[styles.input, styles.noteInput]}
          multiline
          accessibilityLabel="Optional note"
        />

        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
        >
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Session'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
    gap: 10
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  fieldHalf: {
    flex: 1,
    gap: 6
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600'
  },
  input: {
    minHeight: 50,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.textPrimary,
    justifyContent: 'center'
  },
  timerCard: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8
  },
  timerValue: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '700'
  },
  timerHint: {
    color: colors.textSecondary,
    fontSize: 14
  },
  timerActionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  timerButton: {
    minHeight: 48,
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timerButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  timerButtonSecondary: {
    minHeight: 48,
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timerButtonSecondaryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700'
  },
  timerPressed: {
    opacity: 0.85
  },
  datetimeButton: {
    alignItems: 'flex-start'
  },
  datetimePressed: {
    opacity: 0.8
  },
  datetimeText: {
    color: colors.textPrimary,
    fontSize: 16
  },
  noteInput: {
    minHeight: 100,
    paddingVertical: 12,
    textAlignVertical: 'top'
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  saveButtonPressed: {
    opacity: 0.85
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  }
});
