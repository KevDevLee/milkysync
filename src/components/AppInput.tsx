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
      gap: 6
    },
    label: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600'
    },
    inputShell: {
      minHeight: 50,
      borderRadius: 12,
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
      paddingHorizontal: 12,
      fontSize: 16,
      color: colors.textPrimary
    },
    rightAccessory: {
      paddingHorizontal: 8
    },
    helperText: {
      fontSize: 13,
      color: colors.textSecondary
    },
    errorText: {
      fontSize: 13,
      color: colors.danger
    }
  });
}
