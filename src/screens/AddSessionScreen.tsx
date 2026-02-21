import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const MINUTE_OPTIONS = Array.from({ length: 121 }, (_, index) => index);
const MINUTE_ITEM_HEIGHT = 72;
const MINUTE_WHEEL_VISIBLE_ROWS = 2;
const MINUTE_WHEEL_HEIGHT = MINUTE_ITEM_HEIGHT * MINUTE_WHEEL_VISIBLE_ROWS;
const DEFAULT_TIMER_MINUTES = 15;
const MIN_SELECTABLE_MINUTES = 1;
const LAST_TIMER_MINUTES_STORAGE_KEY = '@milkysync:last_timer_minutes';

export function AddSessionScreen(): React.JSX.Element {
  const { addSession } = useAppData();
  const [leftMlInput, setLeftMlInput] = useState('0');
  const [rightMlInput, setRightMlInput] = useState('0');
  const [note, setNote] = useState('');
  const [timestamp, setTimestamp] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedMinutes, setSelectedMinutes] = useState(DEFAULT_TIMER_MINUTES);
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(DEFAULT_TIMER_MINUTES * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_TIMER_MINUTES * 60);
  const [timerMinutesLoaded, setTimerMinutesLoaded] = useState(false);
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
    return Math.max(MIN_SELECTABLE_MINUTES, Math.min(roughIndex, MINUTE_OPTIONS.length - 1));
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
    let active = true;

    const loadLastTimerMinutes = async (): Promise<void> => {
      let minutes = DEFAULT_TIMER_MINUTES;

      try {
        const rawValue = await AsyncStorage.getItem(LAST_TIMER_MINUTES_STORAGE_KEY);
        const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
        if (
          Number.isFinite(parsed) &&
          parsed >= MIN_SELECTABLE_MINUTES &&
          MINUTE_OPTIONS.includes(parsed)
        ) {
          minutes = parsed;
        }
      } catch (error) {
        console.warn('Failed to load last timer minutes.', error);
      }

      if (!active) {
        return;
      }

      setSelectedMinutes(minutes);
      minuteWheelRef.current?.scrollTo({
        x: 0,
        y: MINUTE_OPTIONS.indexOf(minutes) * MINUTE_ITEM_HEIGHT,
        animated: false
      });
      setTimerMinutesLoaded(true);
    };

    void loadLastTimerMinutes();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!timerMinutesLoaded) {
      return;
    }

    void AsyncStorage.setItem(LAST_TIMER_MINUTES_STORAGE_KEY, String(selectedMinutes)).catch((error) => {
      console.warn('Failed to save last timer minutes.', error);
    });
  }, [selectedMinutes, timerMinutesLoaded]);

  const displayMinutes = Math.floor(remainingSeconds / 60);
  const displaySeconds = remainingSeconds % 60;
  const wheelMinuteValue = timerRunning ? displayMinutes : selectedMinutes;

  useEffect(() => {
    if (!timerMinutesLoaded) {
      return;
    }

    const minuteIndex = MINUTE_OPTIONS.indexOf(wheelMinuteValue);
    if (minuteIndex < 0) {
      return;
    }

    minuteWheelRef.current?.scrollTo({
      x: 0,
      y: minuteIndex * MINUTE_ITEM_HEIGHT,
      animated: timerRunning
    });
  }, [timerMinutesLoaded, timerRunning, wheelMinuteValue]);

  const onStartTimer = (): void => {
    if (timerRunning) {
      return;
    }

    if (selectedMinutes < MIN_SELECTABLE_MINUTES) {
      Alert.alert('Validation', 'Please select at least 1 minute.');
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

        <Text style={styles.label}>Duration</Text>
        <View style={styles.minutePickerGroup}>
          <View style={styles.timeDisplayRow}>
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
                        wheelMinuteValue === item && styles.minuteWheelItemTextActive
                      ]}
                    >
                      {item}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <View pointerEvents="none" style={styles.minuteWheelCenterMarker} />
            </View>
            <Text style={styles.timeDivider}>:</Text>
            <View style={styles.secondsBox}>
              <Text style={styles.secondsValue}>{String(displaySeconds).padStart(2, '0')}</Text>
            </View>
          </View>
          <Text style={styles.minuteUnitLabel}>Minutes</Text>
        </View>

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
    width: 168,
    height: MINUTE_WHEEL_HEIGHT,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative'
  },
  minuteWheelDisabled: {
    opacity: 0.65
  },
  minutePickerGroup: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10
  },
  timeDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  minuteUnitLabel: {
    color: colors.textPrimary,
    fontSize: 42,
    fontWeight: '700'
  },
  timeDivider: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: '700'
  },
  secondsBox: {
    minWidth: 112,
    height: MINUTE_WHEEL_HEIGHT,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  secondsValue: {
    color: colors.textPrimary,
    fontSize: 54,
    fontWeight: '700'
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
    fontSize: 42,
    fontWeight: '600',
    opacity: 0.55
  },
  minuteWheelItemTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 54,
    opacity: 1
  },
  minuteWheelCenterMarker: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: (MINUTE_WHEEL_HEIGHT - MINUTE_ITEM_HEIGHT) / 2,
    height: MINUTE_ITEM_HEIGHT,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent'
  },
  timerActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
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
