import { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/theme/colors';

type CircularMinuteDialProps = {
  value: number;
  minSelectable?: number;
  max: number;
  disabled?: boolean;
  countdownSeconds?: number | null;
  countdownTotalSeconds?: number | null;
  showCountdown?: boolean;
  onChange: (value: number) => void;
  onInteractionChange?: (isInteracting: boolean) => void;
};

type Point = {
  x: number;
  y: number;
};

const DIAL_SIZE = 228;
const RING_OUTER_SIZE = 188;
const RING_INNER_SIZE = 120;
const TRACK_RADIUS = (RING_OUTER_SIZE + RING_INNER_SIZE) / 4;
const KNOB_SIZE = 24;
const MINUTES_PER_TURN = 60;
const DEGREES_PER_MINUTE = 360 / MINUTES_PER_TURN;
const TRACK_TOUCH_PADDING = 22;
const MAX_DELTA_DEGREES_PER_EVENT = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeAngle(angle: number): number {
  let next = angle % 360;
  if (next < 0) {
    next += 360;
  }
  return next;
}

function getClockAngleFromTouch(x: number, y: number, center: Point): number {
  const dx = x - center.x;
  const dy = y - center.y;
  return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
}

function shortestAngleDelta(next: number, prev: number): number {
  let delta = next - prev;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  return delta;
}

function pointOnCircle(center: Point, radius: number, clockAngle: number): Point {
  const rad = (clockAngle * Math.PI) / 180;
  return {
    x: center.x + Math.sin(rad) * radius,
    y: center.y - Math.cos(rad) * radius
  };
}

function distanceToCenter(x: number, y: number, center: Point): number {
  const dx = x - center.x;
  const dy = y - center.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function CircularMinuteDial({
  value,
  minSelectable = 1,
  max,
  disabled = false,
  countdownSeconds = null,
  countdownTotalSeconds = null,
  showCountdown = false,
  onChange,
  onInteractionChange
}: CircularMinuteDialProps): React.JSX.Element {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(), []);
  const [dialSize, setDialSize] = useState<Point>({ x: DIAL_SIZE, y: DIAL_SIZE });
  const center = useMemo<Point>(() => ({ x: dialSize.x / 2, y: dialSize.y / 2 }), [dialSize.x, dialSize.y]);

  const safeMax = Math.max(minSelectable, max);
  const clampedValue = clamp(value, minSelectable, safeMax);
  const countdownMode = showCountdown && countdownSeconds !== null && countdownTotalSeconds !== null;
  const safeCountdownSeconds = countdownMode ? Math.max(0, countdownSeconds) : null;
  const countdownMinutesFloat = countdownMode && safeCountdownSeconds !== null ? safeCountdownSeconds / 60 : null;
  const dialMinutesForPosition = countdownMode && countdownMinutesFloat !== null ? countdownMinutesFloat : clampedValue;
  const angleForKnob = normalizeAngle(((dialMinutesForPosition % MINUTES_PER_TURN) / MINUTES_PER_TURN) * 360);
  const knobPoint = pointOnCircle(center, TRACK_RADIUS, angleForKnob);
  const fullTurns = Math.floor(dialMinutesForPosition / MINUTES_PER_TURN);
  const minuteCycleValueRaw = dialMinutesForPosition % MINUTES_PER_TURN;
  const minuteCycleValue =
    minuteCycleValueRaw === 0 && dialMinutesForPosition > 0 ? MINUTES_PER_TURN : minuteCycleValueRaw;

  const dragStartValueRef = useRef(clampedValue);
  const lastAngleRef = useRef<number | null>(null);
  const accumulatedAngleRef = useRef(0);
  const dragActiveRef = useRef(false);

  const isTouchNearTrack = (x: number, y: number): boolean => {
    const distance = distanceToCenter(x, y, center);
    const minRadius = RING_INNER_SIZE / 2 - TRACK_TOUCH_PADDING;
    const maxRadius = RING_OUTER_SIZE / 2 + TRACK_TOUCH_PADDING;
    return distance >= minRadius && distance <= maxRadius;
  };

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (nextWidth !== dialSize.x || nextHeight !== dialSize.y) {
      setDialSize({ x: nextWidth, y: nextHeight });
    }
  };

  const updateFromTouch = (locationX: number, locationY: number): void => {
    if (disabled) {
      return;
    }

    const nextAngle = getClockAngleFromTouch(locationX, locationY, center);
    if (!isTouchNearTrack(locationX, locationY)) {
      // Re-sync angle while outside the active ring to avoid large jumps on re-entry.
      lastAngleRef.current = nextAngle;
      return;
    }

    const prevAngle = lastAngleRef.current;
    if (prevAngle === null) {
      lastAngleRef.current = nextAngle;
      return;
    }

    const delta = shortestAngleDelta(nextAngle, prevAngle);
    const clampedDelta = clamp(delta, -MAX_DELTA_DEGREES_PER_EVENT, MAX_DELTA_DEGREES_PER_EVENT);
    accumulatedAngleRef.current += clampedDelta;
    lastAngleRef.current = nextAngle;

    const minuteDelta = Math.trunc(accumulatedAngleRef.current / DEGREES_PER_MINUTE);
    const nextValue = clamp(dragStartValueRef.current + minuteDelta, minSelectable, safeMax);
    if (nextValue !== clampedValue) {
      onChange(nextValue);
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => {
          if (disabled) {
            return;
          }
          const { locationX, locationY } = event.nativeEvent;
          dragStartValueRef.current = clampedValue;
          accumulatedAngleRef.current = 0;
          lastAngleRef.current = getClockAngleFromTouch(locationX, locationY, center);
          dragActiveRef.current = isTouchNearTrack(locationX, locationY);
          if (dragActiveRef.current) {
            onInteractionChange?.(true);
          }
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          if (!dragActiveRef.current && isTouchNearTrack(locationX, locationY)) {
            dragActiveRef.current = true;
            dragStartValueRef.current = clampedValue;
            accumulatedAngleRef.current = 0;
            lastAngleRef.current = getClockAngleFromTouch(locationX, locationY, center);
            onInteractionChange?.(true);
            return;
          }
          updateFromTouch(locationX, locationY);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: () => {
          const wasActive = dragActiveRef.current;
          dragActiveRef.current = false;
          lastAngleRef.current = null;
          accumulatedAngleRef.current = 0;
          if (wasActive) {
            onInteractionChange?.(false);
          }
        },
        onPanResponderTerminate: () => {
          const wasActive = dragActiveRef.current;
          dragActiveRef.current = false;
          lastAngleRef.current = null;
          accumulatedAngleRef.current = 0;
          if (wasActive) {
            onInteractionChange?.(false);
          }
        }
      }),
    [center, clampedValue, disabled, minSelectable, onChange, onInteractionChange, safeMax]
  );

  const tickAngles = useMemo(() => Array.from({ length: 60 }, (_, index) => index * 6), []);

  return (
    <View
      onLayout={onLayout}
      style={[styles.container, disabled && { opacity: 0.7 }]}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          styles.outerRing,
          {
            width: RING_OUTER_SIZE,
            height: RING_OUTER_SIZE,
            left: center.x - RING_OUTER_SIZE / 2,
            top: center.y - RING_OUTER_SIZE / 2,
            borderColor: colors.border,
            backgroundColor: colors.surface
          }
        ]}
      />

      {tickAngles.map((angle, index) => {
        const tickCenter = pointOnCircle(center, TRACK_RADIUS, angle);
        const major = index % 5 === 0;
        const activeThreshold = minuteCycleValue;
        const active = index < activeThreshold;
        return (
          <View
            key={`tick-${angle}`}
            style={[
              styles.tick,
              {
                width: major ? 4 : 3,
                height: major ? 16 : 10,
                borderRadius: 2,
                backgroundColor: active ? colors.primary : colors.border,
                left: tickCenter.x - (major ? 2 : 1.5),
                top: tickCenter.y - (major ? 8 : 5),
                transform: [{ rotate: `${angle}deg` }]
              }
            ]}
          />
        );
      })}

      <View
        style={[
          styles.innerRing,
          {
            width: RING_INNER_SIZE,
            height: RING_INNER_SIZE,
            left: center.x - RING_INNER_SIZE / 2,
            top: center.y - RING_INNER_SIZE / 2,
            borderColor: colors.border,
            backgroundColor: colors.background
          }
        ]}
      />

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
        {countdownMode && safeCountdownSeconds !== null ? (
          <>
            <Text style={[styles.timerText, { color: colors.textPrimary }]}>
              {String(Math.floor(safeCountdownSeconds / 60)).padStart(2, '0')}:
              {String(safeCountdownSeconds % 60).padStart(2, '0')}
            </Text>
            <Text style={[styles.valueUnitText, { color: colors.textSecondary }]}>remaining</Text>
            <Text style={[styles.turnsText, { color: colors.textSecondary }]}>
              {fullTurns} turn{fullTurns === 1 ? '' : 's'} + {Math.floor(minuteCycleValueRaw)}m
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.valueText, { color: colors.textPrimary }]}>{clampedValue}</Text>
            <Text style={[styles.valueUnitText, { color: colors.textSecondary }]}>minutes</Text>
            <Text style={[styles.turnsText, { color: colors.textSecondary }]}>
              {fullTurns} turn{fullTurns === 1 ? '' : 's'} + {clampedValue % MINUTES_PER_TURN}m
            </Text>
          </>
        )}
      </View>
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
    outerRing: {
      position: 'absolute',
      borderRadius: RING_OUTER_SIZE / 2,
      borderWidth: 1
    },
    innerRing: {
      position: 'absolute',
      borderRadius: RING_INNER_SIZE / 2,
      borderWidth: 1
    },
    tick: {
      position: 'absolute'
    },
    knob: {
      position: 'absolute',
      borderWidth: 3
    },
    centerContent: {
      alignItems: 'center',
      justifyContent: 'center'
    },
    valueText: {
      fontSize: 34,
      fontWeight: '700',
      fontVariant: ['tabular-nums']
    },
    timerText: {
      fontSize: 30,
      fontWeight: '700',
      fontVariant: ['tabular-nums']
    },
    valueUnitText: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5
    },
    turnsText: {
      marginTop: 4,
      fontSize: 11,
      fontWeight: '600'
    }
  });
}
