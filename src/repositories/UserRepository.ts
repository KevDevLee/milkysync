import { getDatabase } from '@/db/database';
import { UserProfile } from '@/types/models';

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  family_id: string | null;
  role: UserProfile['role'];
  created_at: number;
  updated_at: number;
  dirty: number;
};

function mapRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    familyId: row.family_id,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class UserRepository {
  async getById(userId: string): Promise<UserProfile | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', userId);
    return row ? mapRow(row) : null;
  }

  async upsert(user: UserProfile, markDirty = true): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `
      INSERT INTO users (id, email, display_name, family_id, role, created_at, updated_at, dirty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        family_id = excluded.family_id,
        role = excluded.role,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        dirty = excluded.dirty
      `,
      user.id,
      user.email,
      user.displayName,
      user.familyId,
      user.role,
      user.createdAt,
      user.updatedAt,
      markDirty ? 1 : 0
    );
  }

  async getDirty(userId: string): Promise<UserProfile | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<UserRow>(
      'SELECT * FROM users WHERE id = ? AND dirty = 1 LIMIT 1',
      userId
    );
    return row ? mapRow(row) : null;
  }

  async markClean(userId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE users SET dirty = 0 WHERE id = ?', userId);
  }
}

export const userRepository = new UserRepository();
