import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/db/database';
import { PumpSession } from '@/types/models';
import { computeTotalMl } from '@/utils/pump';

type PumpSessionRow = {
  id: string;
  timestamp: number;
  left_ml: number;
  right_ml: number;
  total_ml: number;
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
  note?: string | null;
  userId: string;
  familyId: string;
};

function mapRow(row: PumpSessionRow): PumpSession {
  return {
    id: row.id,
    timestamp: row.timestamp,
    leftMl: row.left_ml,
    rightMl: row.right_ml,
    totalMl: row.total_ml,
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
        note,
        created_at,
        updated_at,
        user_id,
        family_id,
        dirty,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
      `,
      session.id,
      session.timestamp,
      session.leftMl,
      session.rightMl,
      session.totalMl,
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

    if (existing && existing.updated_at > session.updatedAt) {
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
        note,
        created_at,
        updated_at,
        user_id,
        family_id,
        dirty,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
      ON CONFLICT(id) DO UPDATE SET
        timestamp = excluded.timestamp,
        left_ml = excluded.left_ml,
        right_ml = excluded.right_ml,
        total_ml = excluded.total_ml,
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
