import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from 'react-native';

import { Screen } from '@/components/Screen';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { reportError } from '@/utils/error';
import { clampMl } from '@/utils/pump';
import { formatPumpDuration } from '@/utils/timer';

const MINUTE_OPTIONS = Array.from({ length: 116 }, (_, index) => index + 5);
const MINUTE_ITEM_HEIGHT = 30;
const MINUTE_WHEEL_VISIBLE_ROWS = 3;
const MINUTE_WHEEL_HEIGHT = MINUTE_ITEM_HEIGHT * MINUTE_WHEEL_VISIBLE_ROWS;

export function AddSessionScreen(): React.JSX.Element {
  const { addSession } = useAppData();
  const [leftMlInput, setLeftMlInput] = useState('0');
  const [rightMlInput, setRightMlInput] = useState('0');
  const [note, setNote] = useState('');
  const [timestamp, setTimestamp] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedMinutes, setSelectedMinutes] = useState(20);
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(selectedMinutes * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(selectedMinutes * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [countdownStartedAtMs, setCountdownStartedAtMs] = useState<number | null>(null);
  const minuteWheelRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (timerRunning) {
      return;
    }

    const nextTarget = selectedMinutes * 60;
    setTargetDurationSeconds(nextTarget);
    setRemainingSeconds(nextTarget);
  }, [selectedMinutes, timerRunning]);

  useEffect(() => {
    if (!timerRunning || countdownStartedAtMs === null) {
      return;
    }

    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - countdownStartedAtMs) / 1000);
      const nextRemainingSeconds = Math.max(targetDurationSeconds - elapsedSeconds, 0);
      setRemainingSeconds(nextRemainingSeconds);

      if (nextRemainingSeconds === 0) {
        setTimerRunning(false);
        setCountdownStartedAtMs(null);
        Vibration.vibrate([0, 240, 120, 240]);
        Alert.alert('Timer finished', 'Selected pump duration is complete.');
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [countdownStartedAtMs, targetDurationSeconds, timerRunning]);

  const getCurrentRemainingSeconds = (): number => {
    if (!timerRunning || countdownStartedAtMs === null) {
      return remainingSeconds;
    }

    const elapsedSeconds = Math.floor((Date.now() - countdownStartedAtMs) / 1000);
    return Math.max(targetDurationSeconds - elapsedSeconds, 0);
  };

  const getNearestMinuteIndex = (offsetY: number): number => {
    const roughIndex = Math.round(offsetY / MINUTE_ITEM_HEIGHT);
    return Math.max(0, Math.min(roughIndex, MINUTE_OPTIONS.length - 1));
  };

  const onMinutesScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (timerRunning) {
      return;
    }

    const offsetY = event.nativeEvent.contentOffset.y;
    const nextMinuteIndex = getNearestMinuteIndex(offsetY);
    const nextMinutes = MINUTE_OPTIONS[nextMinuteIndex] ?? selectedMinutes;
    setSelectedMinutes(nextMinutes);
  };

  useEffect(() => {
    const initialOffset = MINUTE_OPTIONS.indexOf(selectedMinutes) * MINUTE_ITEM_HEIGHT;
    minuteWheelRef.current?.scrollTo({ x: 0, y: initialOffset, animated: false });
    // Only initial alignment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStartTimer = (): void => {
    if (timerRunning) {
      return;
    }

    const selectedSeconds = selectedMinutes * 60;
    const nextTargetSeconds =
      remainingSeconds > 0 && remainingSeconds <= selectedSeconds ? remainingSeconds : selectedSeconds;
    setTargetDurationSeconds(nextTargetSeconds);
    setRemainingSeconds(nextTargetSeconds);
    setCountdownStartedAtMs(Date.now());
    setTimerRunning(true);
  };

  const onPauseTimer = (): void => {
    if (!timerRunning) {
      return;
    }

    const currentRemainingSeconds = getCurrentRemainingSeconds();
    setRemainingSeconds(currentRemainingSeconds);
    setTimerRunning(false);
    setCountdownStartedAtMs(null);
  };

  const onResetTimer = (): void => {
    const resetSeconds = selectedMinutes * 60;
    setTimerRunning(false);
    setCountdownStartedAtMs(null);
    setTargetDurationSeconds(resetSeconds);
    setRemainingSeconds(resetSeconds);
  };

  const elapsedDurationSeconds = Math.max(
    targetDurationSeconds - getCurrentRemainingSeconds(),
    0
  );

  const onSave = async (): Promise<void> => {
    const leftMl = clampMl(Number(leftMlInput));
    const rightMl = clampMl(Number(rightMlInput));

    if (leftMl === 0 && rightMl === 0) {
      Alert.alert('Validation', 'Enter at least one non-zero amount.');
      return;
    }

    try {
      setSaving(true);
      const currentRemainingSeconds = getCurrentRemainingSeconds();
      const durationSeconds = Math.max(targetDurationSeconds - currentRemainingSeconds, 0);

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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Start Pump Session</Text>

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

        <Text style={styles.label}>Duration (minutes)</Text>
        <View style={[styles.minuteWheelContainer, timerRunning && styles.minuteWheelDisabled]}>
          <ScrollView
            ref={minuteWheelRef}
            showsVerticalScrollIndicator={false}
            style={styles.minuteWheel}
            contentContainerStyle={styles.minuteWheelContent}
            snapToInterval={MINUTE_ITEM_HEIGHT}
            decelerationRate="fast"
            bounces={false}
            nestedScrollEnabled
            scrollEnabled={!timerRunning}
            onMomentumScrollEnd={onMinutesScrollEnd}
            onScrollEndDrag={onMinutesScrollEnd}
          >
            {MINUTE_OPTIONS.map((item) => (
              <View key={item} style={styles.minuteWheelItem}>
                <Text
                  style={[
                    styles.minuteWheelItemText,
                    selectedMinutes === item && styles.minuteWheelItemTextActive
                  ]}
                >
                  {item}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View pointerEvents="none" style={styles.minuteWheelCenterMarker} />
        </View>

        <Text style={styles.label}>Countdown</Text>
        <View style={styles.timerCard}>
          <Text style={styles.timerValue}>{formatPumpDuration(remainingSeconds)}</Text>
          <Text style={styles.timerHint}>Scroll up/down to set minutes. Signal plays at 00:00.</Text>

          <View style={styles.timerActionsRow}>
            <Pressable
              onPress={timerRunning ? onPauseTimer : onStartTimer}
              accessibilityRole="button"
              style={({ pressed }) => [styles.timerButton, pressed && styles.timerPressed]}
            >
              <Text style={styles.timerButtonText}>{timerRunning ? 'Pause' : 'Start'}</Text>
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
  minuteWheelContainer: {
    width: 170,
    height: MINUTE_WHEEL_HEIGHT,
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative'
  },
  minuteWheelDisabled: {
    opacity: 0.65
  },
  minuteWheel: {
    flex: 1
  },
  minuteWheelContent: {
    paddingVertical: (MINUTE_WHEEL_HEIGHT - MINUTE_ITEM_HEIGHT) / 2
  },
  minuteWheelItem: {
    height: MINUTE_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center'
  },
  minuteWheelItemText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.55
  },
  minuteWheelItemTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 22,
    opacity: 1
  },
  minuteWheelCenterMarker: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: (MINUTE_WHEEL_HEIGHT - MINUTE_ITEM_HEIGHT) / 2,
    height: MINUTE_ITEM_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent'
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
