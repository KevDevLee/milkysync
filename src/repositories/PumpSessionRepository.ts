import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/db/database';
import { PumpSession } from '@/types/models';
import { shouldApplyRemoteUpdate } from '@/utils/conflict';
import { computeTotalMl } from '@/utils/pump';

type PumpSessionRow = {
  id: string;
  timestamp: number;
  left_ml: number;
  right_ml: number;
  total_ml: number;
  duration_seconds: number;
  note: string | null;
  created_at: number;
  updated_at: number;
  user_id: string;
  family_id: string;
  dirty: number;
  deleted_at: number | null;
};

export type CreatePumpSessionInput = {
  timestamp: number;
  leftMl: number;
  rightMl: number;
  durationSeconds?: number;
  note?: string | null;
  userId: string;
  familyId: string;
};

export type UpdatePumpSessionInput = {
  id: string;
  timestamp: number;
  leftMl: number;
  rightMl: number;
  durationSeconds: number;
  note?: string | null;
};

function mapRow(row: PumpSessionRow): PumpSession {
  return {
    id: row.id,
    timestamp: row.timestamp,
    leftMl: row.left_ml,
    rightMl: row.right_ml,
    totalMl: row.total_ml,
    durationSeconds: row.duration_seconds ?? 0,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    familyId: row.family_id
  };
}

export class PumpSessionRepository {
  async create(input: CreatePumpSessionInput): Promise<PumpSession> {
    const db = await getDatabase();
    const now = Date.now();

    const session: PumpSession = {
      id: Crypto.randomUUID(),
      timestamp: input.timestamp,
      leftMl: input.leftMl,
      rightMl: input.rightMl,
      totalMl: computeTotalMl(input.leftMl, input.rightMl),
      durationSeconds: Math.max(0, Math.min(2 * 60 * 60, Math.round(input.durationSeconds ?? 0))),
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
      userId: input.userId,
      familyId: input.familyId
    };

    await db.runAsync(
      `
      INSERT INTO pump_sessions (
        id,
        timestamp,
        left_ml,
        right_ml,
        total_ml,
        duration_seconds,
        note,
        created_at,
        updated_at,
        user_id,
        family_id,
        dirty,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
      `,
      session.id,
      session.timestamp,
      session.leftMl,
      session.rightMl,
      session.totalMl,
      session.durationSeconds,
      session.note,
      session.createdAt,
      session.updatedAt,
      session.userId,
      session.familyId
    );

    return session;
  }

  async listByFamily(familyId: string, limit = 100): Promise<PumpSession[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<PumpSessionRow>(
      `
      SELECT * FROM pump_sessions
      WHERE family_id = ?
        AND deleted_at IS NULL
      ORDER BY timestamp DESC
      LIMIT ?
      `,
      familyId,
      limit
    );
    return rows.map(mapRow);
  }

  async update(input: UpdatePumpSessionInput): Promise<PumpSession> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<PumpSessionRow>(
      'SELECT * FROM pump_sessions WHERE id = ? LIMIT 1',
      input.id
    );

    if (!existing || existing.deleted_at !== null) {
      throw new Error('Pump session not found.');
    }

    const now = Date.now();
    const next: PumpSession = {
      id: existing.id,
      timestamp: input.timestamp,
      leftMl: input.leftMl,
      rightMl: input.rightMl,
      totalMl: computeTotalMl(input.leftMl, input.rightMl),
      durationSeconds: Math.max(0, Math.min(2 * 60 * 60, Math.round(input.durationSeconds))),
      note: input.note ?? null,
      createdAt: existing.created_at,
      updatedAt: now,
      userId: existing.user_id,
      familyId: existing.family_id
    };

    await db.runAsync(
      `
      UPDATE pump_sessions
      SET
        timestamp = ?,
        left_ml = ?,
        right_ml = ?,
        total_ml = ?,
        duration_seconds = ?,
        note = ?,
        updated_at = ?,
        dirty = 1
      WHERE id = ?
      `,
      next.timestamp,
      next.leftMl,
      next.rightMl,
      next.totalMl,
      next.durationSeconds,
      next.note,
      next.updatedAt,
      next.id
    );

    return next;
  }

  async getLastByFamily(familyId: string): Promise<PumpSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<PumpSessionRow>(
      `
      SELECT * FROM pump_sessions
      WHERE family_id = ?
        AND deleted_at IS NULL
      ORDER BY timestamp DESC
      LIMIT 1
      `,
      familyId
    );
    return row ? mapRow(row) : null;
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<PumpSessionRow>(
      'SELECT id, deleted_at FROM pump_sessions WHERE id = ? LIMIT 1',
      id
    );

    if (!existing || existing.deleted_at !== null) {
      throw new Error('Pump session not found.');
    }

    const now = Date.now();
    await db.runAsync(
      `
      UPDATE pump_sessions
      SET
        updated_at = ?,
        deleted_at = ?,
        dirty = 1
      WHERE id = ?
      `,
      now,
      now,
      id
    );
  }

  async restore(id: string): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<PumpSessionRow>(
      'SELECT id, deleted_at FROM pump_sessions WHERE id = ? LIMIT 1',
      id
    );

    if (!existing || existing.deleted_at === null) {
      throw new Error('Deleted pump session not found.');
    }

    const now = Date.now();
    await db.runAsync(
      `
      UPDATE pump_sessions
      SET
        updated_at = ?,
        deleted_at = NULL,
        dirty = 1
      WHERE id = ?
      `,
      now,
      id
    );
  }

  async getDailyTotal(familyId: string, dayStart: number, dayEnd: number): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ total: number | null }>(
      `
      SELECT SUM(total_ml) AS total
      FROM pump_sessions
      WHERE family_id = ?
        AND deleted_at IS NULL
        AND timestamp >= ?
        AND timestamp < ?
      `,
      familyId,
      dayStart,
      dayEnd
    );
    return row?.total ?? 0;
  }

  async getDirtyByFamily(familyId: string): Promise<PumpSession[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<PumpSessionRow>(
      `
      SELECT * FROM pump_sessions
      WHERE family_id = ?
        AND dirty = 1
      ORDER BY updated_at ASC
      `,
      familyId
    );
    return rows.map(mapRow);
  }

  async upsertFromRemote(session: PumpSession): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ updated_at: number }>(
      'SELECT updated_at FROM pump_sessions WHERE id = ? LIMIT 1',
      session.id
    );

    if (!shouldApplyRemoteUpdate(existing?.updated_at ?? null, session.updatedAt)) {
      return;
    }

    await db.runAsync(
      `
      INSERT INTO pump_sessions (
        id,
        timestamp,
        left_ml,
        right_ml,
        total_ml,
        duration_seconds,
        note,
        created_at,
        updated_at,
        user_id,
        family_id,
        dirty,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
      ON CONFLICT(id) DO UPDATE SET
        timestamp = excluded.timestamp,
        left_ml = excluded.left_ml,
        right_ml = excluded.right_ml,
        total_ml = excluded.total_ml,
        duration_seconds = excluded.duration_seconds,
        note = excluded.note,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        user_id = excluded.user_id,
        family_id = excluded.family_id,
        dirty = 0,
        deleted_at = excluded.deleted_at
      `,
      session.id,
      session.timestamp,
      session.leftMl,
      session.rightMl,
      session.totalMl,
      session.durationSeconds,
      session.note,
      session.createdAt,
      session.updatedAt,
      session.userId,
      session.familyId
    );
  }

  async markClean(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(`UPDATE pump_sessions SET dirty = 0 WHERE id IN (${placeholders})`, ...ids);
  }
}

export const pumpSessionRepository = new PumpSessionRepository();
