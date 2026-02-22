import { useMemo, useState } from 'react';
import { FlatList, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { Screen } from '@/components/Screen';
import { StateMessage } from '@/components/StateMessage';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { formatDateTime, startOfLocalDay } from '@/utils/date';
import { formatPumpDuration } from '@/utils/timer';

type TrendRange = 'day' | 'week' | 'month' | 'all';
type TrendMetric = 'left' | 'right' | 'total';

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

const RANGE_OPTIONS: Array<{ key: TrendRange; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'Alltime' }
];

const METRIC_DEFS: Array<{ key: TrendMetric; label: string; color: string }> = [
  { key: 'left', label: 'Left', color: colors.primary },
  { key: 'right', label: 'Right', color: colors.danger },
  { key: 'total', label: 'Total', color: colors.accent }
];

const CHART_HEIGHT = 220;
const CHART_PAD_X = 16;
const CHART_PAD_Y = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(bounds.start));
    return `${weekday}, ${formatShortDate(bounds.start)}`;
  }

  if (range === 'week') {
    const endTimestamp = (bounds.endExclusive ?? bounds.start + 7 * ONE_DAY_MS) - 1;
    return `${formatShortDate(bounds.start)} - ${formatShortDate(endTimestamp)}`;
  }

  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(bounds.start));
  const yearShort = String(new Date(bounds.start).getFullYear()).slice(-2);
  return `${monthLabel} '${yearShort}`;
}

function getXAxisLabel(range: TrendRange): string {
  return range === 'day' ? 'Time' : 'Date';
}

function formatRangeBoundary(timestamp: number, range: TrendRange): string {
  if (range === 'day') {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(timestamp));
  }
  return new Intl.DateTimeFormat('en-US', {
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

export function HistoryScreen(): React.JSX.Element {
  const { sessions, dailyTotalMl, loading, refresh } = useAppData();
  const [selectedRange, setSelectedRange] = useState<TrendRange>('day');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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

  const listSessions = useMemo(
    () => [...filteredSessions].sort((a, b) => b.timestamp - a.timestamp),
    [filteredSessions]
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
        startLabel: rangeBounds.start === Number.NEGATIVE_INFINITY ? '' : formatRangeBoundary(rangeBounds.start, selectedRange),
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
          trendSamples.length === 1
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

    return {
      series,
      maxValue,
      yTicks,
      startLabel: formatRangeBoundary(domainStart, selectedRange),
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

  const onRetry = async (): Promise<void> => {
    try {
      setRefreshError(null);
      await refresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Could not refresh history.');
    }
  };

  if (loading) {
    return (
      <Screen>
        <AppCard>
          <StateMessage
            variant="loading"
            title="Loading history..."
            message="We are preparing your sessions and trends."
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
            title="Could not load history"
            message={refreshError}
            actionLabel="Try again"
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
              <Text style={styles.headerLabel}>Today total</Text>
              <Text style={styles.headerValue}>{dailyTotalMl} ml</Text>
            </AppCard>

            <AppCard style={styles.chartCard}>
              <Text style={styles.chartTitle}>Pump Trend</Text>

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
                    <Text
                      style={[
                        styles.chipText,
                        selectedRange === option.key && styles.chipTextActive
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.legendRow}>
                {METRIC_DEFS.map((metric) => (
                  <View key={metric.key} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: metric.color }]} />
                    <Text style={styles.legendText}>{metric.label}</Text>
                  </View>
                ))}
              </View>

              {trendSamples.length === 0 ? (
                <Text style={styles.chartEmpty}>No sessions in this timeframe yet.</Text>
              ) : (
                <>
                  <View style={styles.chartFrame} onLayout={onChartLayout}>
                    {chartData.yTicks.map((tick) => (
                      <View key={`line-${tick.key}`} style={[styles.chartGridLine, { top: tick.y }]} />
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

                  <View style={styles.chartAxisRow}>
                    <Text style={styles.axisLabel}>{chartData.startLabel}</Text>
                    <Text style={styles.axisLabel}>{getXAxisLabel(selectedRange)}</Text>
                    <Text style={styles.axisLabel}>{chartData.endLabel}</Text>
                  </View>

                  <Text style={styles.chartMeta}>
                    Max {Math.round(chartData.maxValue)} ml • Y axis: ml/session
                  </Text>
                </>
              )}
            </AppCard>

            <Text style={styles.listHeading}>Sessions</Text>
          </>
        }
        ListEmptyComponent={
          <AppCard>
            <StateMessage
              variant="empty"
              title="No sessions yet"
              message="Add your first session from the Start tab."
            />
          </AppCard>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.itemCard}>
            <Text style={styles.itemTotal}>{item.totalMl} ml</Text>
            <Text style={styles.itemDetail}>
              L {item.leftMl} ml • R {item.rightMl} ml • {formatDateTime(item.timestamp)}
            </Text>
            {item.durationSeconds > 0 ? (
              <Text style={styles.itemDetail}>Duration {formatPumpDuration(item.durationSeconds)}</Text>
            ) : null}
            {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
          </AppCard>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#e8f2ef'
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
    backgroundColor: '#f9fcfa',
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
    backgroundColor: '#f9fcfa'
  },
  chartAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  axisLabel: {
    color: colors.textSecondary,
    fontSize: 12
  },
  chartMeta: {
    color: colors.textSecondary,
    fontSize: 13
  },
  listHeading: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  listContent: {
    paddingBottom: 24
  },
  itemCard: {
    padding: 12,
    gap: 4
  },
  itemTotal: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700'
  },
  itemDetail: {
    color: colors.textSecondary,
    fontSize: 14
  },
  itemNote: {
    color: colors.textPrimary,
    fontSize: 14
  }
});
