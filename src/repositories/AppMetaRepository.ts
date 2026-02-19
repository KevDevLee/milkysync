import { getDatabase } from '@/db/database';

export class AppMetaRepository {
  async get(key: string): Promise<string | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ? LIMIT 1', key);
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `
      INSERT INTO app_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      key,
      value
    );
  }
}

export const appMetaRepository = new AppMetaRepository();
