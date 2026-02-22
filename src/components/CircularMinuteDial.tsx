import { useEffect, useMemo, useRef, useState } from 'react';
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

type Point = { x: number; y: number };

const DIAL_SIZE = 320;
const OUTER_DIAMETER = 264;
const INNER_DIAMETER = 168;
const TRACK_RADIUS = (OUTER_DIAMETER + INNER_DIAMETER) / 4;
const KNOB_SIZE = 34;
const MINUTES_PER_TURN = 60;
const DEGREES_PER_MINUTE = 360 / MINUTES_PER_TURN;
const TOUCH_MARGIN = 8;
const MAX_DELTA_PER_MOVE_DEG = 18;

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

function shortestAngleDelta(next: number, prev: number): number {
  let delta = next - prev;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function distance(x: number, y: number, center: Point): number {
  const dx = x - center.x;
  const dy = y - center.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleFromTouch(x: number, y: number, center: Point): number {
  const dx = x - center.x;
  const dy = y - center.y;
  return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
}

function pointOnCircle(center: Point, radius: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + Math.sin(rad) * radius,
    y: center.y - Math.cos(rad) * radius
  };
}

export function CircularMinuteDial({
  value,
  minSelectable = 1,
  max,
  disabled = false,
  countdownSeconds = null,
  showCountdown = false,
  onChange,
  onInteractionChange
}: CircularMinuteDialProps): React.JSX.Element {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(), []);

  const [layout, setLayout] = useState<Point>({ x: DIAL_SIZE, y: DIAL_SIZE });
  const [dragDisplayMinutes, setDragDisplayMinutes] = useState<number | null>(null);
  const center = useMemo<Point>(() => ({ x: layout.x / 2, y: layout.y / 2 }), [layout.x, layout.y]);

  const safeMin = Math.max(0, minSelectable);
  const safeMax = Math.max(safeMin, max);
  const currentValue = clamp(value, safeMin, safeMax);
  const countdownMode = Boolean(showCountdown && countdownSeconds !== null);
  const remainingSeconds = countdownMode ? Math.max(0, countdownSeconds ?? 0) : null;
  const remainingMinutesFloat = countdownMode && remainingSeconds !== null ? remainingSeconds / 60 : null;

  const visibleMinutes = countdownMode
    ? (remainingMinutesFloat ?? currentValue)
    : (dragDisplayMinutes ?? currentValue);

  const knobAngle = normalizeAngle((visibleMinutes % MINUTES_PER_TURN) * DEGREES_PER_MINUTE);
  const knobPoint = pointOnCircle(center, TRACK_RADIUS, knobAngle);

  const ringTouchMinRadius = INNER_DIAMETER / 2 - TOUCH_MARGIN;
  const ringTouchMaxRadius = OUTER_DIAMETER / 2 + TOUCH_MARGIN;

  const centerRef = useRef(center);
  const disabledRef = useRef(disabled);
  const onChangeRef = useRef(onChange);
  const onInteractionChangeRef = useRef(onInteractionChange);
  const valueRef = useRef(currentValue);
  const minRef = useRef(safeMin);
  const maxRef = useRef(safeMax);

  const draggingRef = useRef(false);
  const dragStartValueRef = useRef(currentValue);
  const dragAccumulatedDegRef = useRef(0);
  const dragPrevAngleRef = useRef<number | null>(null);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    disabledRef.current = disabled;
    onChangeRef.current = onChange;
    onInteractionChangeRef.current = onInteractionChange;
    valueRef.current = currentValue;
    minRef.current = safeMin;
    maxRef.current = safeMax;
  }, [disabled, onChange, onInteractionChange, currentValue, safeMin, safeMax]);

  const isTouchOnVisibleRing = (x: number, y: number): boolean => {
    const d = distance(x, y, centerRef.current);
    return d >= ringTouchMinRadius && d <= ringTouchMaxRadius;
  };

  const isTouchOnKnob = (x: number, y: number): boolean => {
    const valueForKnob = valueRef.current;
    const knobAngleForHit = normalizeAngle((valueForKnob % MINUTES_PER_TURN) * DEGREES_PER_MINUTE);
    const knobCenter = pointOnCircle(centerRef.current, TRACK_RADIUS, knobAngleForHit);
    return distance(x, y, knobCenter) <= KNOB_SIZE / 2 + 10;
  };

  const isTouchInActiveZone = (x: number, y: number): boolean =>
    isTouchOnVisibleRing(x, y) || isTouchOnKnob(x, y);

  const updateValueFromMove = (x: number, y: number): void => {
    if (disabledRef.current || !draggingRef.current) {
      return;
    }

    if (!isTouchOnVisibleRing(x, y)) {
      return;
    }

    const nextAngle = angleFromTouch(x, y, centerRef.current);
    const prevAngle = dragPrevAngleRef.current;
    if (prevAngle === null) {
      dragPrevAngleRef.current = nextAngle;
      return;
    }

    const rawDelta = shortestAngleDelta(nextAngle, prevAngle);
    const delta = clamp(rawDelta, -MAX_DELTA_PER_MOVE_DEG, MAX_DELTA_PER_MOVE_DEG);
    dragAccumulatedDegRef.current += delta;
    dragPrevAngleRef.current = nextAngle;

    const nextMinuteFloat = dragStartValueRef.current + dragAccumulatedDegRef.current / DEGREES_PER_MINUTE;
    const boundedMinuteFloat = clamp(nextMinuteFloat, minRef.current, maxRef.current);
    setDragDisplayMinutes(boundedMinuteFloat);

    const nextMinuteRounded = clamp(Math.round(boundedMinuteFloat), minRef.current, maxRef.current);
    if (nextMinuteRounded !== valueRef.current) {
      onChangeRef.current(nextMinuteRounded);
    }
  };

  const panResponderRef = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) =>
          !disabledRef.current && isTouchInActiveZone(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
        onMoveShouldSetPanResponder: (evt) =>
          !disabledRef.current && isTouchInActiveZone(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
        onStartShouldSetPanResponderCapture: (evt) =>
          !disabledRef.current && isTouchInActiveZone(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
        onMoveShouldSetPanResponderCapture: (evt) =>
          !disabledRef.current && isTouchInActiveZone(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
        onPanResponderGrant: (evt) => {
        if (disabledRef.current) {
          return;
        }

        const { locationX, locationY } = evt.nativeEvent;
          if (!isTouchInActiveZone(locationX, locationY)) {
            draggingRef.current = false;
            return;
          }

        draggingRef.current = true;
        dragStartValueRef.current = valueRef.current;
        dragAccumulatedDegRef.current = 0;
        dragPrevAngleRef.current = angleFromTouch(locationX, locationY, centerRef.current);
        setDragDisplayMinutes(valueRef.current);
        onInteractionChangeRef.current?.(true);
      },
      onPanResponderMove: (evt) => {
        updateValueFromMove(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        const wasDragging = draggingRef.current;
        draggingRef.current = false;
        dragPrevAngleRef.current = null;
        dragAccumulatedDegRef.current = 0;
        setDragDisplayMinutes(null);
        if (wasDragging) {
          onInteractionChangeRef.current?.(false);
        }
      },
      onPanResponderTerminate: () => {
        const wasDragging = draggingRef.current;
        draggingRef.current = false;
        dragPrevAngleRef.current = null;
        dragAccumulatedDegRef.current = 0;
        setDragDisplayMinutes(null);
        if (wasDragging) {
          onInteractionChangeRef.current?.(false);
        }
      }
    })
  );

  const tickAngles = useMemo(() => Array.from({ length: 60 }, (_, i) => i * 6), []);
  const activeTicks = Math.floor((visibleMinutes % MINUTES_PER_TURN) || 0);

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    const next = { x: Math.round(width), y: Math.round(height) };
    if (next.x !== layout.x || next.y !== layout.y) {
      setLayout(next);
    }
  };

  const largeLabel = countdownMode && remainingSeconds !== null
    ? `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`
    : String(currentValue);

  const smallLabel = countdownMode ? 'remaining' : 'minutes';

  return (
    <View
      onLayout={onLayout}
      style={[styles.container, disabled && styles.disabled]}
      {...panResponderRef.current.panHandlers}
    >
      <View
        style={[
          styles.outerRing,
          {
            width: OUTER_DIAMETER,
            height: OUTER_DIAMETER,
            left: center.x - OUTER_DIAMETER / 2,
            top: center.y - OUTER_DIAMETER / 2,
            borderColor: colors.border,
            backgroundColor: colors.surface
          }
        ]}
      />

      {tickAngles.map((angle, index) => {
        const tickCenter = pointOnCircle(center, TRACK_RADIUS, angle);
        const isMajor = index % 5 === 0;
        const isActive = index < activeTicks;
        return (
          <View
            key={`tick-${angle}`}
            style={[
              styles.tick,
              {
                width: isMajor ? 4 : 3,
                height: isMajor ? 18 : 10,
                borderRadius: 2,
                left: tickCenter.x - (isMajor ? 2 : 1.5),
                top: tickCenter.y - (isMajor ? 9 : 5),
                backgroundColor: isActive ? colors.primary : colors.border,
                transform: [{ rotate: `${angle}deg` }]
              }
            ]}
          />
        );
      })}

      <View
        style={[
          styles.innerCutout,
          {
            width: INNER_DIAMETER,
            height: INNER_DIAMETER,
            left: center.x - INNER_DIAMETER / 2,
            top: center.y - INNER_DIAMETER / 2,
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
        <Text style={[countdownMode ? styles.timerText : styles.valueText, { color: colors.textPrimary }]}>
          {largeLabel}
        </Text>
        <Text style={[styles.unitText, { color: colors.textSecondary }]}>{smallLabel}</Text>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center'
    },
    disabled: {
      opacity: 0.72
    },
    outerRing: {
      position: 'absolute',
      borderWidth: 1,
      borderRadius: OUTER_DIAMETER / 2
    },
    innerCutout: {
      position: 'absolute',
      borderWidth: 1,
      borderRadius: INNER_DIAMETER / 2
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
      fontSize: 48,
      fontWeight: '700',
      fontVariant: ['tabular-nums']
    },
    timerText: {
      fontSize: 42,
      fontWeight: '700',
      fontVariant: ['tabular-nums']
    },
    unitText: {
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6
    }
  });
}
