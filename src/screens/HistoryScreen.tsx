import { useMemo, useState } from 'react';
import { FlatList, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAppData } from '@/state/AppDataContext';
import { colors } from '@/theme/colors';
import { formatDateTime, formatTime, startOfLocalDay } from '@/utils/date';
import { formatPumpDuration } from '@/utils/timer';
import { PumpSession } from '@/types/models';

type TrendRange = 'day' | 'week' | 'month' | 'all';
type TrendMetric = 'left' | 'right' | 'total';

type ChartPoint = {
  id: string;
  x: number;
  y: number;
  value: number;
  timestamp: number;
};

const RANGE_OPTIONS: Array<{ key: TrendRange; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'Alltime' }
];

const METRIC_OPTIONS: Array<{ key: TrendMetric; label: string }> = [
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
  { key: 'total', label: 'Total' }
];

const CHART_HEIGHT = 210;
const CHART_PAD_X = 14;
const CHART_PAD_Y = 12;

function getRangeStart(range: TrendRange, now: number): number {
  if (range === 'day') {
    return startOfLocalDay(now);
  }
  if (range === 'week') {
    return now - 7 * 24 * 60 * 60 * 1000;
  }
  if (range === 'month') {
    return now - 30 * 24 * 60 * 60 * 1000;
  }
  return Number.NEGATIVE_INFINITY;
}

function getMetricValue(session: PumpSession, metric: TrendMetric): number {
  if (metric === 'left') {
    return session.leftMl;
  }
  if (metric === 'right') {
    return session.rightMl;
  }
  return session.totalMl;
}

function formatRangeBoundary(timestamp: number, range: TrendRange): string {
  if (range === 'day') {
    return formatTime(timestamp);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp));
}

export function HistoryScreen(): React.JSX.Element {
  const { sessions, dailyTotalMl } = useAppData();
  const [selectedRange, setSelectedRange] = useState<TrendRange>('day');
  const [selectedMetric, setSelectedMetric] = useState<TrendMetric>('total');
  const [chartWidth, setChartWidth] = useState(0);

  const filteredSessions = useMemo(() => {
    const now = Date.now();
    const rangeStart = getRangeStart(selectedRange, now);
    return sessions.filter((session) => session.timestamp >= rangeStart);
  }, [selectedRange, sessions]);

  const listSessions = useMemo(
    () => [...filteredSessions].sort((a, b) => b.timestamp - a.timestamp),
    [filteredSessions]
  );

  const chartSessions = useMemo(
    () => [...filteredSessions].sort((a, b) => a.timestamp - b.timestamp),
    [filteredSessions]
  );

  const metricColor = useMemo(() => {
    if (selectedMetric === 'left') {
      return colors.primary;
    }
    if (selectedMetric === 'right') {
      return colors.danger;
    }
    return colors.accent;
  }, [selectedMetric]);

  const chartData = useMemo(() => {
    if (chartSessions.length === 0 || chartWidth <= 0) {
      return {
        points: [] as ChartPoint[],
        maxValue: 0,
        startLabel: '',
        endLabel: ''
      };
    }

    const firstTimestamp = chartSessions[0].timestamp;
    const lastTimestamp = chartSessions[chartSessions.length - 1].timestamp;
    const timeSpan = Math.max(lastTimestamp - firstTimestamp, 1);
    const plotWidth = Math.max(chartWidth - CHART_PAD_X * 2, 1);
    const plotHeight = CHART_HEIGHT - CHART_PAD_Y * 2;
    const maxValue = Math.max(
      1,
      ...chartSessions.map((session) => getMetricValue(session, selectedMetric))
    );

    const points = chartSessions.map((session, index) => {
      const value = getMetricValue(session, selectedMetric);
      const x =
        chartSessions.length === 1
          ? CHART_PAD_X + plotWidth / 2
          : CHART_PAD_X + ((session.timestamp - firstTimestamp) / timeSpan) * plotWidth;
      const y = CHART_PAD_Y + (1 - value / maxValue) * plotHeight;
      return {
        id: `${session.id}-${index}`,
        x,
        y,
        value,
        timestamp: session.timestamp
      };
    });

    return {
      points,
      maxValue,
      startLabel: formatRangeBoundary(firstTimestamp, selectedRange),
      endLabel: formatRangeBoundary(lastTimestamp, selectedRange)
    };
  }, [chartSessions, chartWidth, selectedMetric, selectedRange]);

  const onChartLayout = (event: LayoutChangeEvent): void => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth !== chartWidth) {
      setChartWidth(nextWidth);
    }
  };

  const renderSegment = (from: ChartPoint, to: ChartPoint, key: string): React.JSX.Element => {
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
            backgroundColor: metricColor,
            width: length,
            left: (from.x + to.x) / 2 - length / 2,
            top: (from.y + to.y) / 2 - 1,
            transform: [{ rotateZ: `${angleRad}rad` }]
          }
        ]}
      />
    );
  };

  return (
    <Screen>
      <FlatList
        data={listSessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <>
            <View style={styles.headerCard}>
              <Text style={styles.headerLabel}>Today total</Text>
              <Text style={styles.headerValue}>{dailyTotalMl} ml</Text>
            </View>

            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Pump Trend</Text>

              <View style={styles.chipRow}>
                {RANGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => setSelectedRange(option.key)}
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

              <View style={styles.chipRow}>
                {METRIC_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => setSelectedMetric(option.key)}
                    style={({ pressed }) => [
                      styles.chip,
                      selectedMetric === option.key && styles.chipActive,
                      pressed && styles.chipPressed
                    ]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedMetric === option.key && styles.chipTextActive
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {chartData.points.length === 0 ? (
                <Text style={styles.chartEmpty}>No sessions in this timeframe yet.</Text>
              ) : (
                <>
                  <View style={styles.chartFrame} onLayout={onChartLayout}>
                    {chartData.points.slice(1).map((point, index) =>
                      renderSegment(chartData.points[index], point, `segment-${point.id}`)
                    )}
                    {chartData.points.map((point) => (
                      <View
                        key={`dot-${point.id}`}
                        style={[
                          styles.chartDot,
                          {
                            backgroundColor: metricColor,
                            left: point.x - 3.5,
                            top: point.y - 3.5
                          }
                        ]}
                      />
                    ))}
                  </View>

                  <View style={styles.chartAxisRow}>
                    <Text style={styles.axisLabel}>{chartData.startLabel}</Text>
                    <Text style={styles.axisLabel}>{chartData.endLabel}</Text>
                  </View>

                  <Text style={styles.chartMeta}>
                    Max {Math.round(chartData.maxValue)} ml ({selectedMetric})
                  </Text>
                </>
              )}
            </View>

            <Text style={styles.listHeading}>Sessions</Text>
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>No sessions yet. Add one from Start.</Text>}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <Text style={styles.itemTotal}>{item.totalMl} ml</Text>
            <Text style={styles.itemDetail}>
              L {item.leftMl} ml • R {item.rightMl} ml • {formatDateTime(item.timestamp)}
            </Text>
            {item.durationSeconds > 0 ? (
              <Text style={styles.itemDetail}>Duration {formatPumpDuration(item.durationSeconds)}</Text>
            ) : null}
            {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 12,
    gap: 10
  },
  chartTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700'
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
  chartAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16
  }
});
