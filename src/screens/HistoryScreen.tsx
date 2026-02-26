import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { AppCard } from '@/components/AppCard';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { getCurrentIntlLocale, getCurrentLanguage } from '@/i18n/locale';
import { useI18n } from '@/i18n/useI18n';
import { useAppPreferences } from '@/services/preferences/AppPreferencesContext';
import { useAppData } from '@/state/AppDataContext';
import { AppColors, useAppColors, colors as staticColors } from '@/theme/colors';
import { reportError } from '@/utils/error';
import { formatDateTime, startOfLocalDay } from '@/utils/date';
import { clampMl } from '@/utils/pump';
import { formatPumpDuration } from '@/utils/timer';

type TrendRange = 'day' | 'week' | 'month' | 'all';
type TrendMetric = 'left' | 'right' | 'total';
type SessionSort = 'newest' | 'oldest' | 'total_desc' | 'total_asc';

type RangeBounds = {
  start: number;
  endExclusive: number | null;
};

type ChartPoint = {
  id: string;
  x: number;
  y: number;
  value: number;
  timestamp: number;
};

type ChartTick = {
  key: string;
  value: number;
  y: number;
};

type ChartGuide = {
  key: string;
  x: number;
  label: string;
  showLabel: boolean;
};

type MetricSeries = {
  key: TrendMetric;
  label: string;
  color: string;
  points: ChartPoint[];
};

type TrendSample = {
  id: string;
  timestamp: number;
  leftMl: number;
  rightMl: number;
  totalMl: number;
};

const RANGE_OPTIONS: Array<{ key: TrendRange }> = [
  { key: 'day' },
  { key: 'week' },
  { key: 'month' },
  { key: 'all' }
];

const SORT_OPTIONS: Array<{ key: SessionSort }> = [
  { key: 'newest' },
  { key: 'oldest' },
  { key: 'total_desc' },
  { key: 'total_asc' }
];

const METRIC_DEFS: Array<{ key: TrendMetric; label: string; color: string }> = [
  { key: 'left', label: 'Left', color: staticColors.primary },
  { key: 'right', label: 'Right', color: staticColors.danger },
  { key: 'total', label: 'Total', color: staticColors.accent }
];

const CHART_HEIGHT = 220;
const CHART_PAD_X = 16;
const CHART_PAD_Y = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SWIPE_ACTION_WIDTH = 88;
const SWIPE_ACTION_TOTAL_WIDTH = SWIPE_ACTION_WIDTH * 2;

function startOfLocalWeekMonday(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  return date.getTime();
}

function startOfLocalMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function shiftMonth(startTimestamp: number, monthOffset: number): number {
  const date = new Date(startTimestamp);
  date.setMonth(date.getMonth() + monthOffset);
  return date.getTime();
}

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatRangeTitle(range: TrendRange, bounds: RangeBounds): string {
  if (range === 'all') {
    return 'All time';
  }

  if (range === 'day') {
    const weekday = new Intl.DateTimeFormat(getCurrentIntlLocale(), { weekday: 'long' }).format(new Date(bounds.start));
    return `${weekday}, ${formatShortDate(bounds.start)}`;
  }

  if (range === 'week') {
    const endTimestamp = (bounds.endExclusive ?? bounds.start + 7 * ONE_DAY_MS) - 1;
    return `${formatShortDate(bounds.start)} - ${formatShortDate(endTimestamp)}`;
  }

  const monthLabel = new Intl.DateTimeFormat(getCurrentIntlLocale(), { month: 'long' }).format(new Date(bounds.start));
  const yearShort = String(new Date(bounds.start).getFullYear()).slice(-2);
  return `${monthLabel} '${yearShort}`;
}

function formatRangeBoundary(timestamp: number, range: TrendRange): string {
  if (range === 'day') {
    const language = getCurrentLanguage();
    return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
      hour: 'numeric',
      minute: '2-digit',
      hour12: language === 'de' ? false : true
    }).format(new Date(timestamp));
  }
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp));
}

function getRangeBounds(range: TrendRange, now: number, periodOffset: number): RangeBounds {
  if (range === 'all') {
    return { start: Number.NEGATIVE_INFINITY, endExclusive: null };
  }

  if (range === 'day') {
    const start = startOfLocalDay(now) + periodOffset * ONE_DAY_MS;
    return { start, endExclusive: start + ONE_DAY_MS };
  }

  if (range === 'week') {
    const start = startOfLocalWeekMonday(now) + periodOffset * 7 * ONE_DAY_MS;
    return { start, endExclusive: start + 7 * ONE_DAY_MS };
  }

  const monthStart = shiftMonth(startOfLocalMonth(now), periodOffset);
  return { start: monthStart, endExclusive: shiftMonth(monthStart, 1) };
}

function getMetricValueFromSample(sample: TrendSample, metric: TrendMetric): number {
  if (metric === 'left') {
    return sample.leftMl;
  }
  if (metric === 'right') {
    return sample.rightMl;
  }
  return sample.totalMl;
}

function getNiceAxisStep(maxValue: number): number {
  if (maxValue <= 5) {
    return 1;
  }

  const roughStep = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  if (normalized <= 1) {
    return 1 * magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

function buildYAxisTicks(axisMax: number): number[] {
  if (axisMax <= 0) {
    return [0];
  }
  const step = axisMax / 4;
  return [0, 1, 2, 3, 4].map((index) => Math.round(index * step));
}

type HistoryStyles = ReturnType<typeof createStyles>;

type SwipeableHistoryRowProps = {
  styles: HistoryStyles;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editLabel: string;
  deleteLabel: string;
  children: React.JSX.Element;
};

function SwipeableHistoryRow({
  styles,
  onPress,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  children
}: SwipeableHistoryRowProps): React.JSX.Element {
  const translateX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);

  const animateTo = (toValue: number): void => {
    offsetRef.current = toValue;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      bounciness: 0,
      speed: 20
    }).start();
  };

  const closeRow = (): void => {
    animateTo(0);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          translateX.stopAnimation((value) => {
            offsetRef.current = typeof value === 'number' ? value : 0;
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          const next = Math.max(
            -SWIPE_ACTION_TOTAL_WIDTH,
            Math.min(0, offsetRef.current + gestureState.dx)
          );
          translateX.setValue(next);
        },
        onPanResponderRelease: (_event, gestureState) => {
          const projected = offsetRef.current + gestureState.dx;
          const shouldOpen =
            projected < -SWIPE_ACTION_TOTAL_WIDTH * 0.4 || gestureState.vx < -0.35;
          animateTo(shouldOpen ? -SWIPE_ACTION_TOTAL_WIDTH : 0);
        },
        onPanResponderTerminate: () => {
          animateTo(offsetRef.current <= -SWIPE_ACTION_TOTAL_WIDTH / 2 ? -SWIPE_ACTION_TOTAL_WIDTH : 0);
        }
      }),
    [translateX]
  );

  const handleRowPress = (): void => {
    if (offsetRef.current < -4) {
      closeRow();
      return;
    }
    onPress();
  };

  return (
    <View style={styles.swipeRowShell}>
      <View style={styles.swipeActionsRight}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            closeRow();
            onEdit();
          }}
          style={({ pressed }) => [styles.swipeActionButton, styles.swipeActionEdit, pressed && styles.chipPressed]}
        >
          <Text style={styles.swipeActionText}>{editLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            closeRow();
            onDelete();
          }}
          style={({ pressed }) => [
            styles.swipeActionButton,
            styles.swipeActionDelete,
            pressed && styles.chipPressed
          ]}
        >
          <Text style={styles.swipeActionText}>{deleteLabel}</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[styles.swipeContent, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable onPress={handleRowPress} accessibilityRole="button" style={({ pressed }) => pressed && styles.chipPressed}>
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function HistoryScreen(): React.JSX.Element {
  const { sessions, loading, refresh, updateSession, deleteSession, restoreSession } = useAppData();
  const { preferences } = useAppPreferences();
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useI18n();
  const [selectedRange, setSelectedRange] = useState<TrendRange>('day');
  const [sortBy, setSortBy] = useState<SessionSort>('newest');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editLeftMlInput, setEditLeftMlInput] = useState('0');
  const [editRightMlInput, setEditRightMlInput] = useState('0');
  const [editTimestamp, setEditTimestamp] = useState<Date>(new Date());
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingEdit, setDeletingEdit] = useState(false);
  const [historyFeedback, setHistoryFeedback] = useState<{
    messageKey: string;
    undoSessionId?: string;
  } | null>(null);
  const [restoringDeleted, setRestoringDeleted] = useState(false);

  useEffect(() => {
    if (!historyFeedback) {
      return;
    }

    const timer = setTimeout(() => {
      setHistoryFeedback(null);
    }, 6000);

    return () => clearTimeout(timer);
  }, [historyFeedback]);

  const rangeBounds = useMemo(
    () => getRangeBounds(selectedRange, Date.now(), periodOffset),
    [periodOffset, selectedRange]
  );
  const rangeTitle = useMemo(
    () => formatRangeTitle(selectedRange, rangeBounds),
    [rangeBounds, selectedRange]
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (session.timestamp < rangeBounds.start) {
        return false;
      }
      if (rangeBounds.endExclusive !== null && session.timestamp >= rangeBounds.endExclusive) {
        return false;
      }
      return true;
    });
  }, [rangeBounds.endExclusive, rangeBounds.start, sessions]);

  const rangeTotalMl = useMemo(
    () => filteredSessions.reduce((sum, session) => sum + session.totalMl, 0),
    [filteredSessions]
  );

  const rangeTotalLabelKey = useMemo(() => {
    if (selectedRange === 'day') {
      return 'history.totalLabel.total';
    }
    if (selectedRange === 'week') {
      return 'history.totalLabel.week';
    }
    if (selectedRange === 'month') {
      return 'history.totalLabel.month';
    }
    return 'history.totalLabel.all';
  }, [periodOffset, selectedRange]);

  const listSessions = useMemo(
    () =>
      [...filteredSessions].sort((a, b) => {
        switch (sortBy) {
          case 'oldest':
            return a.timestamp - b.timestamp;
          case 'total_desc':
            return b.totalMl - a.totalMl || b.timestamp - a.timestamp;
          case 'total_asc':
            return a.totalMl - b.totalMl || b.timestamp - a.timestamp;
          case 'newest':
          default:
            return b.timestamp - a.timestamp;
        }
      }),
    [filteredSessions, sortBy]
  );

  const chartSessions = useMemo(
    () => [...filteredSessions].sort((a, b) => a.timestamp - b.timestamp),
    [filteredSessions]
  );
  const trendSamples = useMemo<TrendSample[]>(() => {
    if (selectedRange === 'week' || selectedRange === 'month') {
      const byDay = new Map<number, TrendSample>();

      for (const session of chartSessions) {
        const dayStart = startOfLocalDay(session.timestamp);
        const existing = byDay.get(dayStart);

        if (existing) {
          existing.leftMl += session.leftMl;
          existing.rightMl += session.rightMl;
          existing.totalMl += session.totalMl;
        } else {
          byDay.set(dayStart, {
            id: `day-${dayStart}`,
            timestamp: dayStart,
            leftMl: session.leftMl,
            rightMl: session.rightMl,
            totalMl: session.totalMl
          });
        }
      }

      return Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
    }

    return chartSessions.map((session) => ({
      id: session.id,
      timestamp: session.timestamp,
      leftMl: session.leftMl,
      rightMl: session.rightMl,
      totalMl: session.totalMl
    }));
  }, [chartSessions, selectedRange]);

  const chartData = useMemo(() => {
    if (trendSamples.length === 0) {
      return {
        series: METRIC_DEFS.map((metric) => ({ ...metric, points: [] as ChartPoint[] })),
        maxValue: 0,
        yTicks: [] as ChartTick[],
        xGuides: [] as ChartGuide[],
        startLabel: rangeBounds.start === Number.NEGATIVE_INFINITY ? '' : formatRangeBoundary(rangeBounds.start, selectedRange),
        midLabel: '',
        endLabel:
          rangeBounds.endExclusive === null
            ? ''
            : formatRangeBoundary(rangeBounds.endExclusive - 1, selectedRange)
      };
    }

    const firstTimestamp = trendSamples[0].timestamp;
    const lastTimestamp = trendSamples[trendSamples.length - 1].timestamp;
    const domainStart = selectedRange === 'all' ? firstTimestamp : rangeBounds.start;
    const domainEndExclusive =
      selectedRange === 'all' ? lastTimestamp + 1 : (rangeBounds.endExclusive ?? lastTimestamp + 1);
    const timeSpan = Math.max(domainEndExclusive - domainStart, 1);
    const plotWidth = Math.max(chartWidth - CHART_PAD_X * 2, 1);
    const plotHeight = CHART_HEIGHT - CHART_PAD_Y * 2;

    const maxValue = Math.max(
      1,
      ...trendSamples.map((sample) =>
        Math.max(
          getMetricValueFromSample(sample, 'left'),
          getMetricValueFromSample(sample, 'right'),
          getMetricValueFromSample(sample, 'total')
        )
      )
    );
    const axisStep = getNiceAxisStep(maxValue);
    const axisMax = Math.max(axisStep * 4, maxValue);

    const series: MetricSeries[] = METRIC_DEFS.map((metric) => {
      const points = trendSamples.map((sample, index) => {
        const value = getMetricValueFromSample(sample, metric.key);
        const x =
          trendSamples.length === 1 && selectedRange === 'all'
            ? CHART_PAD_X + plotWidth / 2
            : CHART_PAD_X + ((sample.timestamp - domainStart) / timeSpan) * plotWidth;
        const y = CHART_PAD_Y + (1 - value / axisMax) * plotHeight;
        return {
          id: `${metric.key}-${sample.id}-${index}`,
          x,
          y,
          value,
          timestamp: sample.timestamp
        };
      });
      return { ...metric, points };
    });

    const yTicks = buildYAxisTicks(axisMax).map((value, index) => {
      const y = CHART_PAD_Y + (1 - value / axisMax) * plotHeight;
      return { key: `tick-${index}-${value}`, value, y };
    });

    const xGuides = [0.25, 0.5, 0.75].map((ratio, index) => ({
      key: `x-guide-${index}-${ratio}`,
      x: CHART_PAD_X + ratio * plotWidth,
      label: formatRangeBoundary(domainStart + Math.floor(timeSpan * ratio), selectedRange),
      showLabel: ratio !== 0.5
    }));
    const midTimestamp = domainStart + Math.floor(timeSpan / 2);

    return {
      series,
      maxValue,
      yTicks,
      xGuides,
      startLabel: formatRangeBoundary(domainStart, selectedRange),
      midLabel: formatRangeBoundary(midTimestamp, selectedRange),
      endLabel: formatRangeBoundary(domainEndExclusive - 1, selectedRange)
    };
  }, [chartWidth, rangeBounds.endExclusive, rangeBounds.start, selectedRange, trendSamples]);

  const onChartLayout = (event: LayoutChangeEvent): void => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth !== chartWidth) {
      setChartWidth(nextWidth);
    }
  };

  const renderSegment = (from: ChartPoint, to: ChartPoint, color: string, key: string): React.JSX.Element => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angleRad = Math.atan2(dy, dx);

    return (
      <View
        key={key}
        style={[
          styles.chartSegment,
          {
            backgroundColor: color,
            width: length,
            left: (from.x + to.x) / 2 - length / 2,
            top: (from.y + to.y) / 2 - 1,
            transform: [{ rotateZ: `${angleRad}rad` }]
          }
        ]}
      />
    );
  };

  const canGoForward = selectedRange !== 'all' && periodOffset < 0;
  const editingSession = useMemo(
    () => listSessions.find((session) => session.id === editingSessionId) ?? null,
    [editingSessionId, listSessions]
  );

  const openEditSession = (sessionId: string): void => {
    const session = listSessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    setEditingSessionId(session.id);
    setEditLeftMlInput(String(session.leftMl));
    setEditRightMlInput(String(session.rightMl));
    setEditTimestamp(new Date(session.timestamp));
  };

  const closeEditModal = (): void => {
    if (savingEdit || deletingEdit) {
      return;
    }
    setEditingSessionId(null);
  };

  const onSaveEdit = async (): Promise<void> => {
    if (!editingSession) {
      return;
    }

    const leftValid = /^\d+$/.test(editLeftMlInput.trim());
    const rightValid = /^\d+$/.test(editRightMlInput.trim());
    if (!leftValid || !rightValid) {
      Alert.alert(t('common.error'), t('history.edit.validationWholeNumber'));
      return;
    }

    const leftMl = clampMl(Number(editLeftMlInput));
    const rightMl = clampMl(Number(editRightMlInput));
    if (leftMl === 0 && rightMl === 0) {
      Alert.alert(t('common.error'), t('history.edit.validationNonZero'));
      return;
    }

    try {
      setSavingEdit(true);
      await updateSession({
        id: editingSession.id,
        leftMl,
        rightMl,
        timestamp: editTimestamp.getTime()
      });
      setEditingSessionId(null);
      Alert.alert(t('common.saved'), t('history.edit.savedMessage'));
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('history.edit.saveError')));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDeleteSession = (sessionId: string): void => {
    if (savingEdit || deletingEdit) {
      return;
    }

    Alert.alert(t('history.edit.deleteConfirmTitle'), t('history.edit.deleteConfirmMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('history.edit.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setDeletingEdit(true);
              await deleteSession(sessionId);
              setEditingSessionId(null);
              setHistoryFeedback({
                messageKey: 'history.edit.deleteUndoHint',
                undoSessionId: sessionId
              });
            } catch (error) {
              Alert.alert(t('common.error'), reportError(error, t('history.edit.deleteError')));
            } finally {
              setDeletingEdit(false);
            }
          })();
        }
      }
    ]);
  };

  const onDeleteEdit = (): void => {
    if (!editingSession) {
      return;
    }
    confirmDeleteSession(editingSession.id);
  };

  const updateEditDatePart = (nextDate: Date): void => {
    setEditTimestamp((previous) => {
      const merged = new Date(previous);
      merged.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
      return merged;
    });
  };

  const updateEditTimePart = (nextTime: Date): void => {
    setEditTimestamp((previous) => {
      const merged = new Date(previous);
      merged.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0);
      return merged;
    });
  };

  const onRetry = async (): Promise<void> => {
    try {
      setRefreshError(null);
      await refresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : t('history.errorTitle'));
    }
  };

  const onUndoDelete = async (): Promise<void> => {
    if (!historyFeedback?.undoSessionId || restoringDeleted) {
      return;
    }

    try {
      setRestoringDeleted(true);
      await restoreSession(historyFeedback.undoSessionId);
      setHistoryFeedback({ messageKey: 'history.edit.undoDeleteSuccess' });
    } catch (error) {
      Alert.alert(t('common.error'), reportError(error, t('history.edit.undoDeleteError')));
    } finally {
      setRestoringDeleted(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="loading"
            title={t('history.loadingTitle')}
            message={t('history.loadingMessage')}
          />
        </AppCard>
      </Screen>
    );
  }

  if (refreshError) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="error"
            title={t('history.errorTitle')}
            message={refreshError}
            actionLabel={t('common.tryAgain')}
            onAction={() => {
              void onRetry();
            }}
          />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={listSessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <>
            <AppCard style={styles.headerCard}>
              <Text style={styles.headerLabel}>{t(rangeTotalLabelKey)}</Text>
              <Text style={styles.headerValue}>{rangeTotalMl} ml</Text>
            </AppCard>

            <AppCard style={styles.chartCard}>
              <Text style={styles.chartTitle}>{t('history.pumpTrend')}</Text>

              <View style={styles.periodRow}>
                <Pressable
                  onPress={() => {
                    if (selectedRange === 'all') {
                      return;
                    }
                    setPeriodOffset((value) => value - 1);
                  }}
                  style={({ pressed }) => [styles.arrowButton, pressed && styles.chipPressed]}
                  accessibilityRole="button"
                  disabled={selectedRange === 'all'}
                >
                    <Text style={styles.arrowButtonText}>◀</Text>
                </Pressable>
                <Text style={styles.periodLabel}>{rangeTitle}</Text>
                <Pressable
                  onPress={() => {
                    if (!canGoForward) {
                      return;
                    }
                    setPeriodOffset((value) => Math.min(value + 1, 0));
                  }}
                  style={({ pressed }) => [
                    styles.arrowButton,
                    !canGoForward && styles.arrowButtonDisabled,
                    pressed && styles.chipPressed
                  ]}
                  accessibilityRole="button"
                  disabled={!canGoForward}
                >
                  <Text style={[styles.arrowButtonText, !canGoForward && styles.arrowButtonTextDisabled]}>
                    ▶
                  </Text>
                </Pressable>
              </View>

              <View style={styles.chipRow}>
                {RANGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      setSelectedRange(option.key);
                      setPeriodOffset(0);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      selectedRange === option.key && styles.chipActive,
                      pressed && styles.chipPressed
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, selectedRange === option.key && styles.chipTextActive]}>
                      {t(`history.range.${option.key}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.legendRow}>
                {METRIC_DEFS.map((metric) => (
                  <View key={metric.key} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: metric.color }]} />
                    <Text style={styles.legendText}>{t(`history.metric.${metric.key}`)}</Text>
                  </View>
                ))}
              </View>

              {trendSamples.length === 0 ? (
                <Text style={styles.chartEmpty}>{t('history.noSessionsTimeframe')}</Text>
              ) : (
                <>
                  <View style={styles.chartFrame} onLayout={onChartLayout}>
                    {chartData.yTicks.map((tick) => (
                      <View key={`line-${tick.key}`} style={[styles.chartGridLine, { top: tick.y }]} />
                    ))}
                    {chartData.xGuides.map((guide) => (
                      <View key={guide.key} style={[styles.chartGridLineVertical, { left: guide.x }]} />
                    ))}

                    {chartData.series.map((series) =>
                      series.points.slice(1).map((point, index) =>
                        renderSegment(series.points[index], point, series.color, `segment-${point.id}`)
                      )
                    )}

                    {chartData.series.map((series) =>
                      series.points.map((point) => (
                        <View
                          key={`dot-${point.id}`}
                          style={[
                            styles.chartDot,
                            {
                              backgroundColor: series.color,
                              left: point.x - 3.5,
                              top: point.y - 3.5
                            }
                          ]}
                        />
                      ))
                    )}

                    {chartData.yTicks.map((tick) => (
                      <Text key={tick.key} style={[styles.yAxisLabel, { top: tick.y - 7 }]}>
                        {tick.value}
                      </Text>
                    ))}
                  </View>

                  <View style={styles.chartAxisRail}>
                    <Text
                      style={[styles.axisLabelAbsolute, styles.axisLabelMajor, styles.axisLabelStart, { left: CHART_PAD_X }]}
                      numberOfLines={1}
                    >
                      {chartData.startLabel}
                    </Text>
                    {chartData.xGuides
                      .filter((guide) => guide.showLabel)
                      .map((guide) => (
                        <Text
                          key={`guide-label-${guide.key}`}
                          style={[styles.axisLabelAbsolute, styles.axisLabelMinor, { left: guide.x - 34 }]}
                          numberOfLines={1}
                        >
                          {guide.label}
                        </Text>
                      ))}
                    <Text
                      style={[
                        styles.axisLabelAbsolute,
                        styles.axisLabelMajor,
                        styles.axisLabelCenter,
                        { left: (chartData.xGuides.find((guide) => guide.key.includes('-0.5'))?.x ?? chartWidth / 2) - 38 }
                      ]}
                      numberOfLines={1}
                    >
                      {chartData.midLabel}
                    </Text>
                    <Text
                      style={[
                        styles.axisLabelAbsolute,
                        styles.axisLabelMajor,
                        styles.axisLabelEnd,
                        { right: CHART_PAD_X }
                      ]}
                      numberOfLines={1}
                    >
                      {chartData.endLabel}
                    </Text>
                  </View>

                  <View style={styles.chartMetaStack}>
                    <Text style={styles.chartMeta}>
                      {selectedRange === 'day'
                        ? t('history.axis.horizontalTime')
                        : t('history.axis.horizontalDate')}
                    </Text>
                    <Text style={styles.chartMeta}>
                      {t('history.axis.verticalMeta', { max: Math.round(chartData.maxValue) })}
                    </Text>
                  </View>
                </>
              )}
            </AppCard>

            <Text style={styles.listHeading}>{t('history.sessions')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {SORT_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setSortBy(option.key)}
                  style={({ pressed }) => [
                    styles.sortChip,
                    sortBy === option.key && styles.chipActive,
                    pressed && styles.chipPressed
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, sortBy === option.key && styles.chipTextActive]}>
                    {t(`history.sort.${option.key}`)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          <AppCard>
            <StateMessage
              variant="empty"
              title={t('history.noSessionsTitle')}
              message={t('history.noSessionsMessage')}
            />
          </AppCard>
        }
        renderItem={({ item }) => (
          <SwipeableHistoryRow
            styles={styles}
            onPress={() => openEditSession(item.id)}
            onEdit={() => openEditSession(item.id)}
            onDelete={() => confirmDeleteSession(item.id)}
            editLabel={t('history.edit.cta')}
            deleteLabel={t('history.edit.delete')}
          >
            <AppCard style={styles.itemCard}>
              <View style={styles.itemHeaderRow}>
                <Text style={styles.itemTotal}>{item.totalMl} ml</Text>
                <Text style={styles.editCta}>{t('history.edit.cta')}</Text>
              </View>
              <Text style={styles.itemDetail}>
                L {item.leftMl} ml • R {item.rightMl} ml • {formatDateTime(item.timestamp)}
              </Text>
              {item.durationSeconds > 0 ? (
                <Text style={styles.itemDetail}>
                  {t('history.durationPrefix')} {formatPumpDuration(item.durationSeconds)}
                </Text>
              ) : null}
              {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
            </AppCard>
          </SwipeableHistoryRow>
        )}
      />

      <Modal
        visible={Boolean(editingSession)}
        transparent
        animationType="fade"
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('history.edit.title')}</Text>
            {editingSession ? (
              <View style={styles.modalSessionSummary}>
                <Text style={styles.modalSessionSummaryValue}>{editingSession.totalMl} ml</Text>
                <Text style={styles.modalSessionSummaryMeta}>{formatDateTime(editingSession.timestamp)}</Text>
              </View>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
              <View style={styles.row}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>{t('start.leftMl')}</Text>
                  <TextInput
                    value={editLeftMlInput}
                    onChangeText={setEditLeftMlInput}
                    keyboardType="numeric"
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>{t('start.rightMl')}</Text>
                  <TextInput
                    value={editRightMlInput}
                    onChangeText={setEditRightMlInput}
                    keyboardType="numeric"
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>{t('history.edit.dateTime')}</Text>
              {Platform.OS === 'ios' ? (
                <View style={styles.dateTimePickerColumn}>
                  <DateTimePicker
                    value={editTimestamp}
                    mode="date"
                    display="compact"
                    themeVariant={preferences.themeMode}
                    onChange={(_, nextValue) => {
                      if (nextValue) {
                        updateEditDatePart(nextValue);
                      }
                    }}
                  />
                  <DateTimePicker
                    value={editTimestamp}
                    mode="time"
                    display="compact"
                    themeVariant={preferences.themeMode}
                    onChange={(_, nextValue) => {
                      if (nextValue) {
                        updateEditTimePart(nextValue);
                      }
                    }}
                  />
                </View>
              ) : (
                <View style={styles.row}>
                  <View style={styles.fieldHalf}>
                    <DateTimePicker
                      value={editTimestamp}
                      mode="date"
                      onChange={(_, nextValue) => {
                        if (nextValue) {
                          updateEditDatePart(nextValue);
                        }
                      }}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <DateTimePicker
                      value={editTimestamp}
                      mode="time"
                      onChange={(_, nextValue) => {
                        if (nextValue) {
                          updateEditTimePart(nextValue);
                        }
                      }}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={onDeleteEdit}
                disabled={savingEdit || deletingEdit}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalDangerButton,
                  (savingEdit || deletingEdit) && styles.modalButtonDisabled,
                  pressed && styles.chipPressed
                ]}
              >
                <Text style={styles.modalDangerButtonText}>
                  {deletingEdit ? t('common.working') : t('history.edit.delete')}
                </Text>
              </Pressable>
              <Pressable
                onPress={closeEditModal}
                disabled={savingEdit || deletingEdit}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalSecondaryButton,
                  (savingEdit || deletingEdit) && styles.modalButtonDisabled,
                  pressed && styles.chipPressed
                ]}
              >
                <Text style={styles.modalSecondaryButtonText}>{t('settings.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void onSaveEdit();
                }}
                disabled={savingEdit || deletingEdit}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalPrimaryButton,
                  (savingEdit || deletingEdit) && styles.modalButtonDisabled,
                  pressed && styles.chipPressed
                ]}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  {savingEdit ? t('common.working') : t('history.edit.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {historyFeedback ? (
        <View style={styles.feedbackBanner}>
          <Text style={styles.feedbackBannerText}>{t(historyFeedback.messageKey)}</Text>
          {historyFeedback.undoSessionId ? (
            <Pressable
              onPress={() => {
                void onUndoDelete();
              }}
              disabled={restoringDeleted}
              accessibilityRole="button"
              style={({ pressed }) => [styles.feedbackBannerAction, pressed && styles.chipPressed]}
            >
              <Text style={styles.feedbackBannerActionText}>
                {restoringDeleted ? t('common.working') : t('common.undo')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  headerCard: {
    marginBottom: 12,
    gap: 2
  },
  headerLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600'
  },
  headerValue: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '700'
  },
  chartCard: {
    padding: 12,
    marginBottom: 12,
    gap: 10
  },
  chartTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700'
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  periodLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 8
  },
  arrowButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  arrowButtonDisabled: {
    opacity: 0.35
  },
  arrowButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  arrowButtonTextDisabled: {
    color: colors.textSecondary
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.background
  },
  chipPressed: {
    opacity: 0.8
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  chipTextActive: {
    color: colors.primary
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center'
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  chartEmpty: {
    color: colors.textSecondary,
    fontSize: 14
  },
  chartFrame: {
    height: CHART_HEIGHT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chartSurface,
    position: 'relative',
    overflow: 'hidden'
  },
  chartGridLine: {
    position: 'absolute',
    left: CHART_PAD_X,
    right: CHART_PAD_X,
    height: 1,
    backgroundColor: colors.border
  },
  chartGridLineVertical: {
    position: 'absolute',
    top: CHART_PAD_Y,
    bottom: CHART_PAD_Y,
    width: 1,
    backgroundColor: colors.border
  },
  chartSegment: {
    position: 'absolute',
    height: 2,
    borderRadius: 1
  },
  chartDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  yAxisLabel: {
    position: 'absolute',
    left: 4,
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.chartSurface
  },
  chartAxisRail: {
    position: 'relative',
    height: 18,
    marginTop: 2
  },
  axisLabelAbsolute: {
    position: 'absolute',
    color: colors.textSecondary,
    lineHeight: 14
  },
  axisLabelMajor: {
    width: 76,
    fontSize: 12
  },
  axisLabelMinor: {
    width: 68,
    fontSize: 12,
    textAlign: 'center'
  },
  axisLabelCenter: {
    textAlign: 'center',
    width: 76
  },
  axisLabelEnd: {
    textAlign: 'right',
    width: 76
  },
  axisLabelStart: {
    textAlign: 'left'
  },
  chartMeta: {
    color: colors.textSecondary,
    fontSize: 13
  },
  chartMetaStack: {
    gap: 2
  },
  listHeading: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  sortRow: {
    gap: 8,
    paddingBottom: 8
  },
  sortChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  listContent: {
    paddingBottom: 24
  },
  swipeRowShell: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative'
  },
  swipeActionsRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    flexDirection: 'row'
  },
  swipeActionButton: {
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center'
  },
  swipeActionEdit: {
    backgroundColor: colors.primary
  },
  swipeActionDelete: {
    backgroundColor: colors.danger
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8
  },
  swipeContent: {
    backgroundColor: 'transparent'
  },
  feedbackBanner: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 14,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  feedbackBannerText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600'
  },
  feedbackBannerAction: {
    minHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  feedbackBannerActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700'
  },
  itemCard: {
    padding: 12,
    gap: 4
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  itemTotal: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700'
  },
  editCta: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700'
  },
  itemDetail: {
    color: colors.textSecondary,
    fontSize: 14
  },
  itemNote: {
    color: colors.textPrimary,
    fontSize: 14
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 12,
    maxHeight: '80%'
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700'
  },
  modalSessionSummary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2
  },
  modalSessionSummaryValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700'
  },
  modalSessionSummaryMeta: {
    color: colors.textSecondary,
    fontSize: 13
  },
  modalContent: {
    gap: 10
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  fieldHalf: {
    flex: 1,
    gap: 6
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontSize: 16
  },
  dateTimePickerColumn: {
    gap: 10
  },
  modalActions: {
    flexDirection: 'column',
    gap: 8
  },
  modalSecondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  modalSecondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  modalDangerButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  modalDangerButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700'
  },
  modalPrimaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalPrimaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  modalButtonDisabled: {
    opacity: 0.55
  }
  });
}
