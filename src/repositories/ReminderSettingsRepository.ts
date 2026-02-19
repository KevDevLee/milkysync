import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/db/database';
import { ReminderSettings } from '@/types/models';
import { shouldApplyRemoteUpdate } from '@/utils/conflict';

type ReminderSettingsRow = {
  id: string;
  user_id: string;
  interval_minutes: number;
  enabled: number;
  updated_at: number;
  dirty: number;
};

function mapRow(row: ReminderSettingsRow): ReminderSettings {
  return {
    id: row.id,
    userId: row.user_id,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled === 1,
    updatedAt: row.updated_at
  };
}

export class ReminderSettingsRepository {
  async getOrCreate(userId: string): Promise<ReminderSettings> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ReminderSettingsRow>(
      'SELECT * FROM reminder_settings WHERE user_id = ? LIMIT 1',
      userId
    );

    if (row) {
      return mapRow(row);
    }

    const settings: ReminderSettings = {
      id: Crypto.randomUUID(),
      userId,
      intervalMinutes: 120,
      enabled: true,
      updatedAt: Date.now()
    };

    await db.runAsync(
      `
      INSERT INTO reminder_settings (id, user_id, interval_minutes, enabled, updated_at, dirty)
      VALUES (?, ?, ?, ?, ?, 1)
      `,
      settings.id,
      settings.userId,
      settings.intervalMinutes,
      settings.enabled ? 1 : 0,
      settings.updatedAt
    );

    return settings;
  }

  async update(input: { userId: string; intervalMinutes: number; enabled: boolean }): Promise<ReminderSettings> {
    const db = await getDatabase();
    const current = await this.getOrCreate(input.userId);
    const next: ReminderSettings = {
      ...current,
      intervalMinutes: Math.max(30, Math.min(360, Math.round(input.intervalMinutes))),
      enabled: input.enabled,
      updatedAt: Date.now()
    };

    await db.runAsync(
      `
      UPDATE reminder_settings
      SET interval_minutes = ?, enabled = ?, updated_at = ?, dirty = 1
      WHERE user_id = ?
      `,
      next.intervalMinutes,
      next.enabled ? 1 : 0,
      next.updatedAt,
      input.userId
    );

    return next;
  }

  async markClean(userId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE reminder_settings SET dirty = 0 WHERE user_id = ?', userId);
  }

  async getDirty(userId: string): Promise<ReminderSettings | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ReminderSettingsRow>(
      'SELECT * FROM reminder_settings WHERE user_id = ? AND dirty = 1 LIMIT 1',
      userId
    );
    return row ? mapRow(row) : null;
  }

  async upsertFromRemote(settings: ReminderSettings): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ updated_at: number }>(
      'SELECT updated_at FROM reminder_settings WHERE user_id = ? LIMIT 1',
      settings.userId
    );

    if (!shouldApplyRemoteUpdate(existing?.updated_at ?? null, settings.updatedAt)) {
      return;
    }

    await db.runAsync(
      `
      INSERT INTO reminder_settings (id, user_id, interval_minutes, enabled, updated_at, dirty)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(user_id) DO UPDATE SET
        id = excluded.id,
        interval_minutes = excluded.interval_minutes,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        dirty = 0
      `,
      settings.id,
      settings.userId,
      settings.intervalMinutes,
      settings.enabled ? 1 : 0,
      settings.updatedAt
    );
  }
}

export const reminderSettingsRepository = new ReminderSettingsRepository();
