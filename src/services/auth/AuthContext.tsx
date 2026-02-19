import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

import { userRepository } from '@/repositories/UserRepository';
import { supabase, isSupabaseConfigured } from '@/services/supabase/client';
import { UserProfile, UserRole } from '@/types/models';

type AuthContextValue = {
  loading: boolean;
  authError: string | null;
  isConfigured: boolean;
  sessionUserId: string | null;
  profile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName?: string; role: UserRole }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  family_id: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    familyId: row.family_id,
    role: row.role,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return toUserProfile(data as ProfileRow);
}

async function createFamily(): Promise<string> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase.from('families').insert({ created_at: nowIso }).select('id').single();

  if (error) {
    throw error;
  }

  return (data as { id: string }).id;
}

async function createProfile(input: {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  familyId?: string;
}): Promise<UserProfile> {
  const nowIso = new Date().toISOString();
  const familyId = input.familyId ?? (await createFamily());

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: input.id,
      email: input.email,
      display_name: input.displayName ?? null,
      family_id: familyId,
      role: input.role,
      created_at: nowIso,
      updated_at: nowIso
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return toUserProfile(data as ProfileRow);
}

export function AuthProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const syncLocalProfile = useCallback(async (nextProfile: UserProfile | null) => {
    if (!nextProfile) {
      return;
    }
    await userRepository.upsert(nextProfile, false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!sessionUserId || !isSupabaseConfigured) {
      setProfile(null);
      return;
    }

    const remoteProfile = await fetchProfile(sessionUserId);
    if (remoteProfile) {
      setProfile(remoteProfile);
      await syncLocalProfile(remoteProfile);
    } else {
      setProfile(null);
    }
  }, [sessionUserId, syncLocalProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setAuthError('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env to enable auth.');
      return;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setAuthError(error.message);
        }
        setSessionUserId(data.session?.user.id ?? null);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    const { data } = supabase.auth.onAuthStateChange((_, session) => {
      setSessionUserId(session?.user.id ?? null);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    setLoading(true);
    refreshProfile()
      .catch((error: unknown) => {
        console.error(error);
        setAuthError(error instanceof Error ? error.message : 'Could not load profile');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refreshProfile, sessionUserId]);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    setSessionUserId(data.user.id);
  }, []);

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName?: string; role: UserRole }) => {
      setAuthError(null);

      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password
      });

      if (error) {
        throw error;
      }

      const user = data.user;

      if (!user) {
        throw new Error('Signup succeeded but no user returned. Check Supabase email confirmation settings.');
      }

      const nextProfile = await createProfile({
        id: user.id,
        email: user.email ?? input.email,
        displayName: input.displayName,
        role: input.role
      });

      setProfile(nextProfile);
      await syncLocalProfile(nextProfile);
    },
    [syncLocalProfile]
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setSessionUserId(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      authError,
      isConfigured: isSupabaseConfigured,
      sessionUserId,
      profile,
      signIn,
      signUp,
      signOut,
      refreshProfile
    }),
    [authError, loading, profile, refreshProfile, sessionUserId, signIn, signOut, signUp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
