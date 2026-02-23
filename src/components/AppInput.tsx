import { ReactNode, useMemo } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle
} from 'react-native';

import { AppColors, useAppColors } from '@/theme/colors';
import { radii, spacing, typeScale } from '@/theme/tokens';

type AppInputProps = TextInputProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  rightAccessory?: ReactNode;
};

export function AppInput({
  label,
  helperText,
  errorText,
  containerStyle,
  inputStyle,
  rightAccessory,
  ...props
}: AppInputProps): React.JSX.Element {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputShell, errorText && styles.inputShellError]}>
        <TextInput
          {...props}
          style={[styles.input, inputStyle]}
          placeholderTextColor={colors.textSecondary}
        />
        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
      </View>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      {!errorText && helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    field: {
      gap: spacing.xs + 2
    },
    label: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      fontWeight: '600'
    },
    inputShell: {
      minHeight: 50,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center'
    },
    inputShellError: {
      borderColor: colors.danger
    },
    input: {
      flex: 1,
      minHeight: 50,
      paddingHorizontal: spacing.md,
      fontSize: typeScale.bodyLg,
      color: colors.textPrimary
    },
    rightAccessory: {
      paddingHorizontal: spacing.sm
    },
    helperText: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary
    },
    errorText: {
      fontSize: typeScale.bodySm,
      color: colors.danger
    }
  });
}
