import { useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

import { AppColors, useAppColors } from '@/theme/colors';

type AppButtonVariant = 'primary' | 'secondary' | 'danger';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: AppButtonVariant;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

export function AppButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
  labelStyle,
  accessibilityLabel
}: AppButtonProps): React.JSX.Element {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style
      ]}
    >
      <Text
        style={[
          styles.baseLabel,
          variant === 'primary' && styles.primaryLabel,
          variant === 'secondary' && styles.secondaryLabel,
          variant === 'danger' && styles.dangerLabel,
          labelStyle
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    base: {
      minHeight: 50,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14
    },
    pressed: {
      opacity: 0.86
    },
    disabled: {
      opacity: 0.55
    },
    primary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      borderWidth: 1
    },
    secondary: {
      backgroundColor: colors.surface,
      borderColor: colors.primary,
      borderWidth: 1
    },
    danger: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
      borderWidth: 1
    },
    baseLabel: {
      fontSize: 16,
      fontWeight: '700'
    },
    primaryLabel: {
      color: '#fff'
    },
    secondaryLabel: {
      color: colors.primary
    },
    dangerLabel: {
      color: '#fff'
    }
  });
}
