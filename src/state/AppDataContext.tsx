import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { appMetaRepository } from '@/repositories/AppMetaRepository';
import { pumpSessionRepository } from '@/repositories/PumpSessionRepository';
import { reminderSettingsRepository } from '@/repositories/ReminderSettingsRepository';
import { userRepository } from '@/repositories/UserRepository';
import { notificationService } from '@/services/notifications';
import { syncService } from '@/services/sync/SyncService';
import { ReminderSettings, PumpSession, UserProfile } from '@/types/models';
import { endOfLocalDay, startOfLocalDay } from '@/utils/date';
import { computeNextReminderTimestamp } from '@/utils/reminder';

const REMINDER_NOTIFICATION_KEY_PREFIX = 'next_reminder_notification';

export type AddSessionInput = {
  leftMl: number;
  rightMl: number;
  note?: string;
  timestamp: number;
  durationSeconds?: number;
};

export type UpdateSessionInput = {
  id: string;
  leftMl: number;
  rightMl: number;
  timestamp: number;
  note?: string;
};

type AppDataContextValue = {
  profile: UserProfile;
  sessions: PumpSession[];
  dailyTotalMl: number;
  reminderSettings: ReminderSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  addSession: (input: AddSessionInput) => Promise<PumpSession>;
  updateSession: (input: UpdateSessionInput) => Promise<PumpSession>;
  deleteSession: (sessionId: string) => Promise<void>;
  saveReminderSettings: (input: { intervalMinutes: number; enabled: boolean }) => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

type AppDataProviderProps = PropsWithChildren<{
  profile: UserProfile;
}>;

function reminderNotificationKey(userId: string): string {
  return `${REMINDER_NOTIFICATION_KEY_PREFIX}_${userId}`;
}

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

  const syncNow = useCallback(async () => {
    try {
      await syncService.sync(profile);
      await refresh();
    } catch (error) {
      console.error('Sync failed', error);
    }
  }, [profile, refresh]);

  const scheduleNextReminder = useCallback(
    async (lastSessionTimestamp: number | null, nextSettings: ReminderSettings) => {
      const metaKey = reminderNotificationKey(profile.id);
      const previousNotificationId = await appMetaRepository.get(metaKey);

      if (previousNotificationId) {
        await notificationService.cancelScheduled(previousNotificationId).catch(() => undefined);
      }

      if (!nextSettings.enabled) {
        await appMetaRepository.set(metaKey, '');
        return;
      }

      const nextReminderTimestamp = computeNextReminderTimestamp(
        lastSessionTimestamp,
        nextSettings.intervalMinutes
      );

      const nextNotificationId = await notificationService.scheduleReminder({
        at: nextReminderTimestamp,
        title: 'Pump reminder',
        body: 'Time for the next pumping session.',
        data: {
          source: 'local_reminder',
          familyId: profile.familyId ?? ''
        }
      });

      await appMetaRepository.set(metaKey, nextNotificationId);
    },
    [profile.familyId, profile.id]
  );

  useEffect(() => {
    (async () => {
      try {
        await notificationService.initialize();
      } catch (error) {
        console.warn('Notification init warning', error);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await userRepository.upsert(profile, false);
        await refresh();
        await syncNow();
      } catch (error) {
        console.error('Failed to initialize app data', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile, refresh, syncNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void syncNow();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncNow]);

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
        durationSeconds: input.durationSeconds ?? 0,
        note: input.note,
        userId: profile.id,
        familyId
      });

      await refresh();
      await scheduleNextReminder(saved.timestamp, reminderSettings);
      void syncNow();
      return saved;
    },
    [profile.familyId, profile.id, refresh, reminderSettings, scheduleNextReminder, syncNow]
  );

  const updateSession = useCallback(
    async (input: UpdateSessionInput) => {
      const familyId = profile.familyId;
      if (!familyId) {
        throw new Error('No family linked to this profile yet.');
      }

      const existing = sessions.find((session) => session.id === input.id);
      if (!existing) {
        throw new Error('Pump session not found in current state.');
      }

      const saved = await pumpSessionRepository.update({
        id: existing.id,
        timestamp: input.timestamp,
        leftMl: input.leftMl,
        rightMl: input.rightMl,
        durationSeconds: existing.durationSeconds,
        note: input.note ?? existing.note
      });

      await refresh();
      const lastSession = await pumpSessionRepository.getLastByFamily(familyId);
      await scheduleNextReminder(lastSession?.timestamp ?? null, reminderSettings);
      void syncNow();
      return saved;
    },
    [profile.familyId, refresh, reminderSettings, scheduleNextReminder, sessions, syncNow]
  );

  const saveReminderSettings = useCallback(
    async (input: { intervalMinutes: number; enabled: boolean }) => {
      const nextSettings = await reminderSettingsRepository.update({
        userId: profile.id,
        intervalMinutes: input.intervalMinutes,
        enabled: input.enabled
      });
      setReminderSettings(nextSettings);

      const familyId = profile.familyId;
      const lastSession = familyId ? await pumpSessionRepository.getLastByFamily(familyId) : null;
      await scheduleNextReminder(lastSession?.timestamp ?? null, nextSettings);
      void syncNow();
    },
    [profile.familyId, profile.id, scheduleNextReminder, syncNow]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const familyId = profile.familyId;
      if (!familyId) {
        throw new Error('No family linked to this profile yet.');
      }

      await pumpSessionRepository.softDelete(sessionId);
      await refresh();
      const lastSession = await pumpSessionRepository.getLastByFamily(familyId);
      await scheduleNextReminder(lastSession?.timestamp ?? null, reminderSettings);
      void syncNow();
    },
    [profile.familyId, refresh, reminderSettings, scheduleNextReminder, syncNow]
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      profile,
      sessions,
      dailyTotalMl,
      reminderSettings,
      loading,
      refresh,
      syncNow,
      addSession,
      updateSession,
      deleteSession,
      saveReminderSettings
    }),
    [
      addSession,
      dailyTotalMl,
      loading,
      profile,
      refresh,
      reminderSettings,
      saveReminderSettings,
      sessions,
      syncNow,
      deleteSession,
      updateSession
    ]
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
