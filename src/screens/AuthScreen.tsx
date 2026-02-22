import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppInput } from '@/components/AppInput';
import { StateMessage } from '@/components/StateMessage';
import { useAuth } from '@/services/auth/AuthContext';
import { colors } from '@/theme/colors';
import { UserRole } from '@/types/models';
import { reportError } from '@/utils/error';

type AuthMode = 'login' | 'signup';

export function AuthScreen(): React.JSX.Element {
  const { signIn, signUp, loading, isConfigured, authError } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('mother');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (): Promise<void> => {
    if (!email || !password) {
      Alert.alert('Validation', 'Email and password are required.');
      return;
    }

    try {
      setSubmitting(true);
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          role
        });
      }
    } catch (error) {
      Alert.alert('Auth error', reportError(error, 'Authentication failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <StateMessage
          variant="loading"
          title="Checking session..."
          message="We are loading your account."
        />
      </View>
    );
  }

  if (!isConfigured) {
    return (
      <View style={styles.configContainer}>
        <Text style={styles.title}>MilkySync</Text>
        <AppCard>
          <StateMessage
            variant="error"
            title="Supabase is not configured"
            message="Add the Supabase values in .env and restart Expo."
          />
        </AppCard>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MilkySync</Text>
      <Text style={styles.subtitle}>{mode === 'login' ? 'Welcome back' : 'Create your family account'}</Text>

      <AppCard style={styles.formCard}>
        <View style={styles.switchRow}>
          <Pressable
            onPress={() => setMode('login')}
            style={[styles.switchChip, mode === 'login' && styles.switchChipActive]}
          >
            <Text style={[styles.switchChipText, mode === 'login' && styles.switchChipTextActive]}>Log In</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('signup')}
            style={[styles.switchChip, mode === 'signup' && styles.switchChipActive]}
          >
            <Text style={[styles.switchChipText, mode === 'signup' && styles.switchChipTextActive]}>Sign Up</Text>
          </Pressable>
        </View>

        {mode === 'signup' ? (
          <>
            <AppInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              autoCapitalize="words"
            />
            <View style={styles.roleRow}>
              {(['mother', 'partner', 'other'] as UserRole[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setRole(option)}
                  style={[styles.roleChip, role === option && styles.roleChipActive]}
                >
                  <Text style={[styles.roleChipText, role === option && styles.roleChipTextActive]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <AppInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <AppInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry={!showPassword}
          rightAccessory={
            <Pressable
              onPress={() => setShowPassword((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={8}
              style={({ pressed }) => [styles.passwordToggle, pressed && styles.passwordTogglePressed]}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          }
        />

        {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

        <AppButton
          onPress={onSubmit}
          disabled={submitting}
          label={submitting ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
        />
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: colors.background,
    gap: 12
  },
  configContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: colors.background,
    gap: 12
  },
  formCard: {
    gap: 12
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.textPrimary
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary
  },
  switchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  switchChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  switchChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  switchChipText: {
    color: colors.textPrimary,
    fontWeight: '600'
  },
  switchChipTextActive: {
    color: '#ffffff'
  },
  passwordToggle: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  passwordTogglePressed: {
    opacity: 0.75
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface
  },
  roleChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e6f2ef'
  },
  roleChipText: {
    color: colors.textSecondary,
    textTransform: 'capitalize',
    fontWeight: '600'
  },
  roleChipTextActive: {
    color: colors.primary
  },
  errorText: {
    color: colors.danger,
    fontSize: 14
  }
});
