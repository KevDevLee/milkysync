import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';

import { AppButton } from '@/components/AppButton';
import { AppColors, useAppColors } from '@/theme/colors';

type StateVariant = 'loading' | 'empty' | 'error' | 'info';

type StateMessageProps = {
  variant: StateVariant;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

function iconNameForVariant(variant: StateVariant): keyof typeof Ionicons.glyphMap {
  if (variant === 'empty') {
    return 'file-tray-outline';
  }
  if (variant === 'error') {
    return 'alert-circle-outline';
  }
  return 'information-circle-outline';
}

export function StateMessage({
  variant,
  title,
  message,
  actionLabel,
  onAction
}: StateMessageProps): React.JSX.Element {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {variant === 'loading' ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={iconNameForVariant(variant)} size={22} color={colors.textSecondary} />
      )}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          style={styles.action}
          labelStyle={styles.actionLabel}
        />
      ) : null}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 20,
      paddingHorizontal: 16
    },
    title: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center'
    },
    message: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center'
    },
    action: {
      minHeight: 40,
      marginTop: 4
    },
    actionLabel: {
      fontSize: 14
    }
  });
}
