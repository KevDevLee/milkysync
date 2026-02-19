import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { pumpSessionRepository } from '@/repositories/PumpSessionRepository';
import { reminderSettingsRepository } from '@/repositories/ReminderSettingsRepository';
import { userRepository } from '@/repositories/UserRepository';
import { ReminderSettings, PumpSession, UserProfile } from '@/types/models';
import { endOfLocalDay, startOfLocalDay } from '@/utils/date';

export type AddSessionInput = {
  leftMl: number;
  rightMl: number;
  note?: string;
  timestamp: number;
};

type AppDataContextValue = {
  profile: UserProfile;
  sessions: PumpSession[];
  dailyTotalMl: number;
  reminderSettings: ReminderSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  addSession: (input: AddSessionInput) => Promise<PumpSession>;
  saveReminderSettings: (input: { intervalMinutes: number; enabled: boolean }) => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

type AppDataProviderProps = PropsWithChildren<{
  profile: UserProfile;
}>;

export function AppDataProvider({ children, profile }: AppDataProviderProps): React.JSX.Element {
  const [sessions, setSessions] = useState<PumpSession[]>([]);
  const [dailyTotalMl, setDailyTotalMl] = useState(0);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({
    id: `reminder-${profile.id}`,
    userId: profile.id,
    intervalMinutes: 120,
    enabled: true,
    updatedAt: Date.now()
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const familyId = profile.familyId;
    if (!familyId) {
      setSessions([]);
      setDailyTotalMl(0);
      return;
    }

    const [nextSessions, nextSettings] = await Promise.all([
      pumpSessionRepository.listByFamily(familyId, 200),
      reminderSettingsRepository.getOrCreate(profile.id)
    ]);

    const dayStart = startOfLocalDay(Date.now());
    const dayEnd = endOfLocalDay(Date.now());
    const total = await pumpSessionRepository.getDailyTotal(familyId, dayStart, dayEnd);

    setSessions(nextSessions);
    setDailyTotalMl(total);
    setReminderSettings(nextSettings);
  }, [profile.familyId, profile.id]);

  useEffect(() => {
    (async () => {
      try {
        await userRepository.upsert(profile, false);
        await refresh();
      } catch (error) {
        console.error('Failed to initialize app data', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile, refresh]);

  const addSession = useCallback(
    async (input: AddSessionInput) => {
      const familyId = profile.familyId;
      if (!familyId) {
        throw new Error('No family linked to this profile yet.');
      }

      const saved = await pumpSessionRepository.create({
        timestamp: input.timestamp,
        leftMl: input.leftMl,
        rightMl: input.rightMl,
        note: input.note,
        userId: profile.id,
        familyId
      });

      await refresh();
      return saved;
    },
    [profile.familyId, profile.id, refresh]
  );

  const saveReminderSettings = useCallback(
    async (input: { intervalMinutes: number; enabled: boolean }) => {
      const nextSettings = await reminderSettingsRepository.update({
        userId: profile.id,
        intervalMinutes: input.intervalMinutes,
        enabled: input.enabled
      });
      setReminderSettings(nextSettings);
    },
    [profile.id]
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      profile,
      sessions,
      dailyTotalMl,
      reminderSettings,
      loading,
      refresh,
      addSession,
      saveReminderSettings
    }),
    [addSession, dailyTotalMl, loading, profile, refresh, reminderSettings, saveReminderSettings, sessions]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const value = useContext(AppDataContext);
  if (!value) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return value;
}
