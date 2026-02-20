import * as Network from 'expo-network';

import { appMetaRepository } from '@/repositories/AppMetaRepository';
import { pumpSessionRepository } from '@/repositories/PumpSessionRepository';
import { reminderSettingsRepository } from '@/repositories/ReminderSettingsRepository';
import { userRepository } from '@/repositories/UserRepository';
import { supabase } from '@/services/supabase/client';
import { PumpSession, ReminderSettings, UserProfile } from '@/types/models';

type SyncResult = {
  pushedSessions: number;
  pulledSessions: number;
  skipped: boolean;
  message?: string;
};

type PumpSessionRow = {
  id: string;
  timestamp_ms: number;
  left_ml: number;
  right_ml: number;
  total_ml: number;
  duration_seconds?: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  family_id: string;
  deleted_at: string | null;
};

function toRemoteSession(session: PumpSession): PumpSessionRow {
  return {
    id: session.id,
    timestamp_ms: session.timestamp,
    left_ml: session.leftMl,
    right_ml: session.rightMl,
    total_ml: session.totalMl,
    duration_seconds: session.durationSeconds,
    note: session.note,
    created_at: new Date(session.createdAt).toISOString(),
    updated_at: new Date(session.updatedAt).toISOString(),
    user_id: session.userId,
    family_id: session.familyId,
    deleted_at: null
  };
}

function toLocalSession(row: PumpSessionRow): PumpSession {
  return {
    id: row.id,
    timestamp: row.timestamp_ms,
    leftMl: row.left_ml,
    rightMl: row.right_ml,
    totalMl: row.total_ml,
    durationSeconds: row.duration_seconds ?? 0,
    note: row.note,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    userId: row.user_id,
    familyId: row.family_id
  };
}

function toIsoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

function toMsFromIso(iso: string): number {
  return new Date(iso).getTime();
}

async function hasInternetConnection(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export class SyncService {
  async sync(profile: UserProfile): Promise<SyncResult> {
    if (!profile.familyId) {
      return {
        pushedSessions: 0,
        pulledSessions: 0,
        skipped: true,
        message: 'Profile has no familyId.'
      };
    }

    const online = await hasInternetConnection();
    if (!online) {
      return {
        pushedSessions: 0,
        pulledSessions: 0,
        skipped: true,
        message: 'Offline.'
      };
    }

    const dirtyUser = await userRepository.getDirty(profile.id);
    if (dirtyUser) {
      const { error: userError } = await supabase.from('profiles').upsert(
        {
          id: dirtyUser.id,
          email: dirtyUser.email,
          display_name: dirtyUser.displayName,
          family_id: dirtyUser.familyId,
          role: dirtyUser.role,
          created_at: toIsoFromMs(dirtyUser.createdAt),
          updated_at: toIsoFromMs(dirtyUser.updatedAt)
        },
        { onConflict: 'id' }
      );
      if (userError) {
        throw userError;
      }
      await userRepository.markClean(dirtyUser.id);
    }

    const dirtySettings = await reminderSettingsRepository.getDirty(profile.id);
    if (dirtySettings) {
      const { error: settingsError } = await supabase.from('reminder_settings').upsert(
        {
          id: dirtySettings.id,
          user_id: dirtySettings.userId,
          interval_minutes: dirtySettings.intervalMinutes,
          enabled: dirtySettings.enabled,
          updated_at: toIsoFromMs(dirtySettings.updatedAt)
        },
        { onConflict: 'user_id' }
      );
      if (settingsError) {
        throw settingsError;
      }
      await reminderSettingsRepository.markClean(profile.id);
    }

    const dirtySessions = await pumpSessionRepository.getDirtyByFamily(profile.familyId);

    if (dirtySessions.length > 0) {
      const payload = dirtySessions.map(toRemoteSession);
      const { error: pushError } = await supabase
        .from('pump_sessions')
        .upsert(payload, { onConflict: 'id' });

      if (pushError) {
        throw pushError;
      }

      await pumpSessionRepository.markClean(dirtySessions.map((session) => session.id));
    }

    const lastSyncKey = `last_sync_${profile.familyId}`;
    const lastSyncIso = (await appMetaRepository.get(lastSyncKey)) ?? new Date(0).toISOString();

    const { data: pulledSessionsRows, error: pullError } = await supabase
      .from('pump_sessions')
      .select('*')
      .eq('family_id', profile.familyId)
      .gte('updated_at', lastSyncIso)
      .order('updated_at', { ascending: true });

    if (pullError) {
      throw pullError;
    }

    const pulledSessions = (pulledSessionsRows as PumpSessionRow[] | null) ?? [];
    for (const row of pulledSessions) {
      await pumpSessionRepository.upsertFromRemote(toLocalSession(row));
    }

    const { data: reminderRow, error: reminderPullError } = await supabase
      .from('reminder_settings')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (reminderPullError) {
      throw reminderPullError;
    }

    if (reminderRow) {
      const remoteReminder: ReminderSettings = {
        id: reminderRow.id as string,
        userId: reminderRow.user_id as string,
        intervalMinutes: reminderRow.interval_minutes as number,
        enabled: reminderRow.enabled as boolean,
        updatedAt: toMsFromIso(reminderRow.updated_at as string)
      };

      await reminderSettingsRepository.upsertFromRemote(remoteReminder);
    }

    await appMetaRepository.set(lastSyncKey, new Date().toISOString());

    return {
      pushedSessions: dirtySessions.length,
      pulledSessions: pulledSessions.length,
      skipped: false
    };
  }
}

export const syncService = new SyncService();
