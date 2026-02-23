import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View
} from 'react-native';

import { AppCard } from '@/components/AppCard';
import { Screen } from '@/components/Screen';
import { useI18n } from '@/i18n/useI18n';
import { useAppPreferences } from '@/services/preferences/AppPreferencesContext';
import { useAppData } from '@/state/AppDataContext';
import { AppColors, useAppColors } from '@/theme/colors';
import { reportError } from '@/utils/error';
import { formatDateTime, formatRelativeDuration } from '@/utils/date';
import { clampMl } from '@/utils/pump';

const MIN_SELECTABLE_MINUTES = 1;
const MAX_SESSION_TIMER_MINUTES = 360;
const MAX_NEXT_ROUND_TIMER_MINUTES = 360;
const SESSION_MINUTE_OPTIONS = Array.from({ length: MAX_SESSION_TIMER_MINUTES + 1 }, (_, index) => index);
const NEXT_ROUND_MINUTE_OPTIONS = Array.from(
  { length: MAX_NEXT_ROUND_TIMER_MINUTES + 1 },
  (_, index) => index
);
const MINUTE_ITEM_HEIGHT = 72;
const MINUTE_WHEEL_VISIBLE_ROWS = 2;
const MINUTE_WHEEL_HEIGHT = MINUTE_ITEM_HEIGHT * MINUTE_WHEEL_VISIBLE_ROWS;
const DEFAULT_TIMER_MINUTES = 15;
const LAST_TIMER_MINUTES_STORAGE_KEY = '@milkysync:last_timer_minutes';

export function AddSessionScreen(): React.JSX.Element {
  const { addSession, sessions, reminderSettings, refresh } = useAppData();
  const { preferences } = useAppPreferences();
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useI18n();
  const [leftMlInput, setLeftMlInput] = useState('0');
  const [rightMlInput, setRightMlInput] = useState('0');
  const [note, setNote] = useState('');
  const [timestamp, setTimestamp] = useState(new Date());
  const [saving, setSaving] = useState(false);

  const [selectedMinutes, setSelectedMinutes] = useState(DEFAULT_TIMER_MINUTES);
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(DEFAULT_TIMER_MINUTES * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_TIMER_MINUTES * 60);
  const [timerMinutesLoaded, setTimerMinutesLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [countdownStartedAtMs, setCountdownStartedAtMs] = useState<number | null>(null);
  const [showNextRoundPrompt, setShowNextRoundPrompt] = useState(false);
  const [nextRoundMinutes, setNextRoundMinutes] = useState(DEFAULT_TIMER_MINUTES);
  const [now, setNow] = useState(Date.now());
  const minuteWheelRef = useRef<ScrollView>(null);
  const minuteWheelMomentumRef = useRef(false);
  const suppressMinuteWheelEventsRef = useRef(false);
  const nextRoundWheelRef = useRef<ScrollView>(null);
  const nextRoundWheelMomentumRef = useRef(false);
  const nextRoundDefaultMinutes = Math.max(
    MIN_SELECTABLE_MINUTES,
    Math.min(MAX_NEXT_ROUND_TIMER_MINUTES, reminderSettings.intervalMinutes || DEFAULT_TIMER_MINUTES)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const nextTarget = selectedMinutes * 60;
    setTargetDurationSeconds(nextTarget);
    setRemainingSeconds(nextTarget);
  }, [selectedMinutes]);

  useEffect(() => {
    if (!showNextRoundPrompt) {
      return;
    }

    const timer = setTimeout(() => {
      const minuteIndex = NEXT_ROUND_MINUTE_OPTIONS.indexOf(nextRoundMinutes);
      if (minuteIndex < 0) {
        return;
      }

      nextRoundWheelRef.current?.scrollTo({
        x: 0,
        y: minuteIndex * MINUTE_ITEM_HEIGHT,
        animated: false
      });
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [nextRoundMinutes, showNextRoundPrompt]);

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
        setNextRoundMinutes(nextRoundDefaultMinutes);
        setShowNextRoundPrompt(true);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [countdownStartedAtMs, nextRoundDefaultMinutes, targetDurationSeconds, timerRunning]);

  const getCurrentRemainingSeconds = (): number => {
    if (!timerRunning || countdownStartedAtMs === null) {
      return remainingSeconds;
    }

    const elapsedSeconds = Math.floor((Date.now() - countdownStartedAtMs) / 1000);
    return Math.max(targetDurationSeconds - elapsedSeconds, 0);
  };

  const getNearestMinuteIndex = (offsetY: number, maxIndex: number): number => {
    const roughIndex = Math.round(offsetY / MINUTE_ITEM_HEIGHT);
    return Math.max(MIN_SELECTABLE_MINUTES, Math.min(roughIndex, maxIndex));
  };

  const onMinutesScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (timerRunning || !timerMinutesLoaded || suppressMinuteWheelEventsRef.current) {
      return;
    }

    const offsetY = event.nativeEvent.contentOffset.y;
    const nextMinuteIndex = getNearestMinuteIndex(offsetY, SESSION_MINUTE_OPTIONS.length - 1);
    const nextMinutes = SESSION_MINUTE_OPTIONS[nextMinuteIndex] ?? selectedMinutes;
    setSelectedMinutes(Math.max(MIN_SELECTABLE_MINUTES, nextMinutes));
    if (nextMinuteIndex === MIN_SELECTABLE_MINUTES) {
      minuteWheelRef.current?.scrollTo({
        x: 0,
        y: MIN_SELECTABLE_MINUTES * MINUTE_ITEM_HEIGHT,
        animated: false
      });
    }
  }, [selectedMinutes, timerMinutesLoaded, timerRunning]);

  const onNextRoundMinutesScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const nextMinuteIndex = getNearestMinuteIndex(offsetY, NEXT_ROUND_MINUTE_OPTIONS.length - 1);
      const nextMinutes = NEXT_ROUND_MINUTE_OPTIONS[nextMinuteIndex] ?? nextRoundMinutes;
      setNextRoundMinutes(Math.max(MIN_SELECTABLE_MINUTES, nextMinutes));
      if (nextMinuteIndex === MIN_SELECTABLE_MINUTES) {
        nextRoundWheelRef.current?.scrollTo({
          x: 0,
          y: MIN_SELECTABLE_MINUTES * MINUTE_ITEM_HEIGHT,
          animated: false
        });
      }
    },
    [nextRoundMinutes]
  );

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
          parsed <= MAX_SESSION_TIMER_MINUTES &&
          SESSION_MINUTE_OPTIONS.includes(parsed)
        ) {
          minutes = parsed;
        }
      } catch (error) {
        console.warn('Failed to load last timer minutes.', error);
      }

      if (!active) {
        return;
      }

      const initialSeconds = minutes * 60;
      setTargetDurationSeconds(initialSeconds);
      setRemainingSeconds(initialSeconds);
      setSelectedMinutes(minutes);
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
  const lastSession = sessions[0] ?? null;
  const hasPartialCountdown = remainingSeconds !== targetDurationSeconds;
  const wheelMinuteValue = timerRunning || hasPartialCountdown ? displayMinutes : selectedMinutes;
  const minuteWheelItems = useMemo(
    () =>
      SESSION_MINUTE_OPTIONS.map((item) => (
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
      )),
    [wheelMinuteValue]
  );
  const nextRoundMinuteWheelItems = useMemo(
    () =>
      NEXT_ROUND_MINUTE_OPTIONS.map((item) => (
        <View key={`next-round-${item}`} style={styles.modalMinuteWheelItem}>
          <Text
            style={[
              styles.modalMinuteWheelItemText,
              nextRoundMinutes === item && styles.modalMinuteWheelItemTextActive
            ]}
          >
            {item}
          </Text>
        </View>
      )),
    [nextRoundMinutes, styles.modalMinuteWheelItem, styles.modalMinuteWheelItemText, styles.modalMinuteWheelItemTextActive]
  );

  useEffect(() => {
    if (!timerMinutesLoaded) {
      return;
    }

    const minuteIndex = SESSION_MINUTE_OPTIONS.indexOf(wheelMinuteValue);
    if (minuteIndex < 0) {
      return;
    }

    suppressMinuteWheelEventsRef.current = true;
    minuteWheelRef.current?.scrollTo({
      x: 0,
      y: minuteIndex * MINUTE_ITEM_HEIGHT,
      animated: false
    });
    setTimeout(() => {
      suppressMinuteWheelEventsRef.current = false;
    }, 0);
  }, [timerMinutesLoaded, wheelMinuteValue]);

  const startFreshTimer = (minutes: number): void => {
    const safeMinutes = Math.max(MIN_SELECTABLE_MINUTES, Math.min(MAX_NEXT_ROUND_TIMER_MINUTES, minutes));
    const selectedSeconds = safeMinutes * 60;

    setSelectedMinutes(safeMinutes);
    setTargetDurationSeconds(selectedSeconds);
    setRemainingSeconds(selectedSeconds);
    setCountdownStartedAtMs(Date.now());
    setTimerRunning(true);
  };

  const onStartTimer = (): void => {
    if (timerRunning) {
      return;
    }

    if (selectedMinutes < MIN_SELECTABLE_MINUTES) {
      Alert.alert(t('start.validationMin1Title'), t('start.validationMin1Message'));
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

  const onStartNextRoundTimer = (): void => {
    setShowNextRoundPrompt(false);
    startFreshTimer(nextRoundMinutes);
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
      Alert.alert(t('start.validationNonZeroTitle'), t('start.validationNonZeroMessage'));
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
      Alert.alert(t('start.savedTitle'), t('start.savedMessage'));
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('start.saveErrorFallback')));
    } finally {
      setSaving(false);
    }
  };

  const onRefreshStartScreen = useCallback(async (): Promise<void> => {
    try {
      setRefreshing(true);
      setNow(Date.now());
      setTimestamp(new Date());
      await refresh();
    } catch (error) {
      console.warn('Failed to refresh start screen.', error);
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void onRefreshStartScreen();
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.content}
      >
        <AppCard style={styles.lastSessionCard}>
          <Text style={styles.lastSessionLabel}>{t('start.lastSession')}</Text>
          {lastSession ? (
            <>
              <Text style={styles.lastSessionValue}>
                {formatRelativeDuration(lastSession.timestamp, now)}
              </Text>
              <Text style={styles.lastSessionMeta}>{formatDateTime(lastSession.timestamp)}</Text>
            </>
          ) : (
            <Text style={styles.lastSessionMeta}>{t('start.noSessionYet')}</Text>
          )}
        </AppCard>

        <Text style={styles.title}>{t('start.title')}</Text>

        <Text style={styles.label}>{t('start.duration')}</Text>
        <View style={styles.minutePickerGroup}>
          <View style={styles.timeDisplayRow}>
            <View style={[styles.minuteWheelContainer, timerRunning && styles.minuteWheelDisabled]}>
              {timerMinutesLoaded ? (
                <ScrollView
                  ref={minuteWheelRef}
                  showsVerticalScrollIndicator={false}
                  style={styles.minuteWheel}
                  contentOffset={{ x: 0, y: wheelMinuteValue * MINUTE_ITEM_HEIGHT }}
                  contentContainerStyle={styles.minuteWheelContent}
                  snapToInterval={MINUTE_ITEM_HEIGHT}
                  decelerationRate="fast"
                  bounces={false}
                  nestedScrollEnabled
                  scrollEnabled={!timerRunning}
                  onScrollBeginDrag={() => {
                    minuteWheelMomentumRef.current = false;
                  }}
                  onMomentumScrollBegin={() => {
                    minuteWheelMomentumRef.current = true;
                  }}
                  onMomentumScrollEnd={onMinutesScrollEnd}
                  onScrollEndDrag={(event) => {
                    if (!minuteWheelMomentumRef.current) {
                      onMinutesScrollEnd(event);
                    }
                  }}
                >
                  {minuteWheelItems}
                </ScrollView>
              ) : (
                <View style={styles.minuteWheelLoadingPlaceholder} />
              )}
              <View pointerEvents="none" style={styles.minuteWheelCenterMarker} />
            </View>
            <Text style={styles.timeDivider}>:</Text>
            <View style={styles.secondsBox}>
              <Text style={styles.secondsValue}>{String(displaySeconds).padStart(2, '0')}</Text>
            </View>
          </View>
          <Text style={styles.minuteUnitLabel}>{t('start.minutes')}</Text>
        </View>

        <View style={styles.timerActionsRow}>
          <Pressable
            onPress={timerRunning ? onPauseTimer : onStartTimer}
            accessibilityRole="button"
            style={({ pressed }) => [styles.timerButton, pressed && styles.timerPressed]}
          >
            <Text style={styles.timerButtonText}>{timerRunning ? t('start.pause') : t('start.start')}</Text>
          </Pressable>
          <Pressable
            onPress={onResetTimer}
            accessibilityRole="button"
            style={({ pressed }) => [styles.timerButtonSecondary, pressed && styles.timerPressed]}
          >
            <Text style={styles.timerButtonSecondaryText}>{t('start.reset')}</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>{t('start.leftMl')}</Text>
            <TextInput
              value={leftMlInput}
              onChangeText={setLeftMlInput}
              keyboardType="numeric"
              style={styles.input}
              accessibilityLabel={t('start.leftAmountA11y')}
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>{t('start.rightMl')}</Text>
            <TextInput
              value={rightMlInput}
              onChangeText={setRightMlInput}
              keyboardType="numeric"
              style={styles.input}
              accessibilityLabel={t('start.rightAmountA11y')}
            />
          </View>
        </View>

        <View style={styles.labelRow}>
          <Text style={styles.label}>{t('start.sessionTime')}</Text>
          <Pressable
            onPress={() => {
              setTimestamp(new Date());
              setNow(Date.now());
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.nowButton, pressed && styles.timerPressed]}
          >
            <Text style={styles.nowButtonText}>{t('start.useNow')}</Text>
          </Pressable>
        </View>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={timestamp}
            mode="datetime"
            display="compact"
            themeVariant={preferences.themeMode}
            onChange={(_, nextValue) => {
              if (nextValue) {
                setTimestamp(nextValue);
              }
            }}
          />
        ) : (
          <View style={styles.row}>
            <View style={styles.fieldHalf}>
              <DateTimePicker
                value={timestamp}
                mode="date"
                onChange={(_, nextValue) => {
                  if (nextValue) {
                    setTimestamp(nextValue);
                  }
                }}
              />
            </View>
            <View style={styles.fieldHalf}>
              <DateTimePicker
                value={timestamp}
                mode="time"
                onChange={(_, nextValue) => {
                  if (nextValue) {
                    setTimestamp(nextValue);
                  }
                }}
              />
            </View>
          </View>
        )}

        <Text style={styles.label}>{t('start.noteOptional')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('start.notePlaceholder')}
          style={[styles.input, styles.noteInput]}
          multiline
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('start.noteA11y')}
        />

        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
      >
        <Text style={styles.saveText}>{saving ? t('start.saving') : t('start.saveSession')}</Text>
      </Pressable>
      </ScrollView>

      <Modal
        visible={showNextRoundPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNextRoundPrompt(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('start.timerFinishedTitle')}</Text>
            <Text style={styles.modalMessage}>{t('start.nextRoundPromptMessage')}</Text>
            <Text style={styles.modalHint}>
              {t('start.nextRoundDefaultHint', { minutes: nextRoundDefaultMinutes })}
            </Text>

            <View style={styles.modalMinuteSelectorRow}>
              <View style={styles.modalMinuteWheelContainer}>
                <ScrollView
                  ref={nextRoundWheelRef}
                  showsVerticalScrollIndicator={false}
                  style={styles.modalMinuteWheel}
                  contentContainerStyle={styles.minuteWheelContent}
                  snapToInterval={MINUTE_ITEM_HEIGHT}
                  decelerationRate="fast"
                  bounces={false}
                  nestedScrollEnabled
                  onScrollBeginDrag={() => {
                    nextRoundWheelMomentumRef.current = false;
                  }}
                  onMomentumScrollBegin={() => {
                    nextRoundWheelMomentumRef.current = true;
                  }}
                  onMomentumScrollEnd={onNextRoundMinutesScrollEnd}
                  onScrollEndDrag={(event) => {
                    if (!nextRoundWheelMomentumRef.current) {
                      onNextRoundMinutesScrollEnd(event);
                    }
                  }}
                >
                  {nextRoundMinuteWheelItems}
                </ScrollView>
                <View pointerEvents="none" style={styles.modalMinuteWheelCenterMarker} />
              </View>
              <Text style={styles.modalMinuteLabel}>{t('start.minutes')}</Text>
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable
                onPress={() => setShowNextRoundPrompt(false)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.modalSecondaryButton, pressed && styles.timerPressed]}
              >
                <Text style={styles.modalSecondaryButtonText}>{t('start.nextRoundNotNow')}</Text>
              </Pressable>
              <Pressable
                onPress={onStartNextRoundTimer}
                accessibilityRole="button"
                style={({ pressed }) => [styles.modalPrimaryButton, pressed && styles.timerPressed]}
              >
                <Text style={styles.modalPrimaryButtonText}>{t('start.nextRoundStartButton')}</Text>
              </Pressable>
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
    paddingBottom: 24,
    gap: 10
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8
  },
  lastSessionCard: {
    marginBottom: 4,
    gap: 3
  },
  lastSessionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  lastSessionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary
  },
  lastSessionMeta: {
    fontSize: 14,
    color: colors.textSecondary
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  nowButton: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  nowButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary
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
  minuteWheelLoadingPlaceholder: {
    flex: 1
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
    fontWeight: '700',
    fontVariant: ['tabular-nums']
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
    opacity: 0.55,
    fontVariant: ['tabular-nums']
  },
  minuteWheelItemTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 54,
    opacity: 1,
    fontVariant: ['tabular-nums']
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
  modalMessage: {
    fontSize: 15,
    color: colors.textSecondary
  },
  modalHint: {
    fontSize: 13,
    color: colors.textSecondary
  },
  modalMinuteSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 4
  },
  modalMinuteWheelContainer: {
    width: 100,
    height: MINUTE_WHEEL_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden'
  },
  modalMinuteWheel: {
    flex: 1
  },
  modalMinuteWheelItem: {
    height: MINUTE_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalMinuteWheelItemText: {
    color: colors.textSecondary,
    fontSize: 28,
    fontWeight: '600',
    opacity: 0.55,
    fontVariant: ['tabular-nums']
  },
  modalMinuteWheelItemTextActive: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: '700',
    opacity: 1,
    fontVariant: ['tabular-nums']
  },
  modalMinuteWheelCenterMarker: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: (MINUTE_WHEEL_HEIGHT - MINUTE_ITEM_HEIGHT) / 2,
    height: MINUTE_ITEM_HEIGHT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent'
  },
  modalMinuteLabel: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700'
  },
  modalActionsRow: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 4
  },
  modalPrimaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  modalPrimaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center'
  },
  modalSecondaryButton: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12
  },
  modalSecondaryButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center'
  }
  });
}
