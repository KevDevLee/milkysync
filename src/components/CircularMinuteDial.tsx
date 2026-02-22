import { useMemo, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { useAppColors } from '@/theme/colors';

type CircularMinuteDialProps = {
  value: number;
  max: number;
  minSelectable?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

const START_ANGLE_CLOCK = 225; // bottom-left
const END_ANGLE_CLOCK = 495; // wraps to bottom-right, passing top
const ARC_SPAN_DEG = END_ANGLE_CLOCK - START_ANGLE_CLOCK;
const DIAL_SIZE = 212;
const RING_SIZE = 172;
const KNOB_SIZE = 18;

type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toRadians(clockAngle: number): number {
  return (clockAngle * Math.PI) / 180;
}

function getPointFromClockAngle(center: Point, radius: number, clockAngle: number): Point {
  const rad = toRadians(clockAngle);
  return {
    x: center.x + Math.sin(rad) * radius,
    y: center.y - Math.cos(rad) * radius
  };
}

function getClockAngleFromTouch(x: number, y: number, center: Point): number {
  const dx = x - center.x;
  const dy = y - center.y;
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) {
    angle += 360;
  }
  return angle;
}

function projectAngleToDial(clockAngle: number): number {
  const candidates = [clockAngle, clockAngle + 360];
  let bestProjected = START_ANGLE_CLOCK;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const projected = clamp(candidate, START_ANGLE_CLOCK, END_ANGLE_CLOCK);
    const distance = Math.abs(candidate - projected);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProjected = projected;
    }
  }

  return bestProjected;
}

export function CircularMinuteDial({
  value,
  max,
  minSelectable = 1,
  disabled = false,
  onChange
}: CircularMinuteDialProps): React.JSX.Element {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(), []);
  const [layoutSize, setLayoutSize] = useState<Point>({ x: DIAL_SIZE, y: DIAL_SIZE });
  const center = useMemo<Point>(
    () => ({ x: layoutSize.x / 2, y: layoutSize.y / 2 }),
    [layoutSize.x, layoutSize.y]
  );

  const safeMax = Math.max(1, max);
  const clampedValue = clamp(value, 0, safeMax);
  const progress = clampedValue / safeMax;
  const indicatorAngle = START_ANGLE_CLOCK + progress * ARC_SPAN_DEG;
  const knobPoint = getPointFromClockAngle(center, RING_SIZE / 2, indicatorAngle);

  const tickValues = useMemo(
    () => Array.from({ length: 13 }, (_, index) => Math.round((index / 12) * safeMax)),
    [safeMax]
  );

  const onDialLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (nextWidth !== layoutSize.x || nextHeight !== layoutSize.y) {
      setLayoutSize({ x: nextWidth, y: nextHeight });
    }
  };

  const updateFromTouch = (event: GestureResponderEvent): void => {
    if (disabled) {
      return;
    }

    const { locationX, locationY } = event.nativeEvent;
    const touchAngle = getClockAngleFromTouch(locationX, locationY, center);
    const projected = projectAngleToDial(touchAngle);
    const nextProgress = (projected - START_ANGLE_CLOCK) / ARC_SPAN_DEG;
    const rawMinutes = Math.round(nextProgress * safeMax);
    const nextMinutes = clamp(rawMinutes, minSelectable, safeMax);
    onChange(nextMinutes);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: updateFromTouch,
        onPanResponderMove: updateFromTouch
      }),
    [center, disabled, layoutSize.x, layoutSize.y, minSelectable, onChange, safeMax]
  );

  const scaleLabelPositions = useMemo(() => {
    const radius = RING_SIZE / 2 + 30;
    return {
      min: getPointFromClockAngle(center, radius, START_ANGLE_CLOCK),
      mid: getPointFromClockAngle(center, radius, START_ANGLE_CLOCK + ARC_SPAN_DEG / 2),
      max: getPointFromClockAngle(center, radius, END_ANGLE_CLOCK)
    };
  }, [center]);

  return (
    <View
      style={[styles.container, disabled && { opacity: 0.72 }]}
      onLayout={onDialLayout}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          styles.ring,
          {
            width: RING_SIZE,
            height: RING_SIZE,
            borderColor: colors.border,
            backgroundColor: colors.surface
          }
        ]}
      />

      {tickValues.map((tickValue, index) => {
        const tickProgress = tickValue / safeMax;
        const tickAngle = START_ANGLE_CLOCK + tickProgress * ARC_SPAN_DEG;
        const tickCenter = getPointFromClockAngle(center, RING_SIZE / 2, tickAngle);
        const isMajor = index % 3 === 0;
        const isActive = tickValue <= clampedValue;
        return (
          <View
            key={`tick-${tickValue}-${index}`}
            style={[
              styles.tick,
              {
                width: isMajor ? 4 : 3,
                height: isMajor ? 14 : 9,
                borderRadius: 2,
                backgroundColor: isActive ? colors.primary : colors.border,
                left: tickCenter.x - (isMajor ? 2 : 1.5),
                top: tickCenter.y - (isMajor ? 7 : 4.5),
                transform: [{ rotate: `${tickAngle}deg` }]
              }
            ]}
          />
        );
      })}

      <View
        style={[
          styles.knob,
          {
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: KNOB_SIZE / 2,
            left: knobPoint.x - KNOB_SIZE / 2,
            top: knobPoint.y - KNOB_SIZE / 2,
            backgroundColor: colors.primary,
            borderColor: colors.surface
          }
        ]}
      />

      <View style={styles.centerContent}>
        <Text style={[styles.valueText, { color: colors.textPrimary }]}>{clampedValue}</Text>
        <Text style={[styles.unitText, { color: colors.textSecondary }]}>min</Text>
      </View>

      <Text
        style={[
          styles.scaleLabel,
          { color: colors.textSecondary, left: scaleLabelPositions.min.x - 16, top: scaleLabelPositions.min.y - 8 }
        ]}
      >
        0
      </Text>
      <Text
        style={[
          styles.scaleLabel,
          { color: colors.textSecondary, left: scaleLabelPositions.mid.x - 20, top: scaleLabelPositions.mid.y - 10 }
        ]}
      >
        180
      </Text>
      <Text
        style={[
          styles.scaleLabel,
          { color: colors.textSecondary, left: scaleLabelPositions.max.x - 24, top: scaleLabelPositions.max.y - 8 }
        ]}
      >
        360
      </Text>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    },
    ring: {
      borderWidth: 1,
      borderRadius: RING_SIZE / 2
    },
    tick: {
      position: 'absolute'
    },
    knob: {
      position: 'absolute',
      borderWidth: 2
    },
    centerContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center'
    },
    valueText: {
      fontSize: 38,
      fontWeight: '700',
      fontVariant: ['tabular-nums']
    },
    unitText: {
      marginTop: -2,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5
    },
    scaleLabel: {
      position: 'absolute',
      fontSize: 13,
      fontWeight: '700',
      minWidth: 32,
      textAlign: 'center'
    }
  });
}
