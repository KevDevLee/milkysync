import * as SQLite from 'expo-sqlite';

const DB_NAME = 'milkysync.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pump_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      timestamp INTEGER NOT NULL,
      left_ml INTEGER NOT NULL,
      right_ml INTEGER NOT NULL,
      total_ml INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      family_id TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1,
      deleted_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pump_sessions_family_ts
      ON pump_sessions (family_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_pump_sessions_dirty
      ON pump_sessions (dirty);

    CREATE TABLE IF NOT EXISTS reminder_settings (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT UNIQUE NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 120,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      family_id TEXT,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const pumpSessionColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(pump_sessions);');
  const hasDurationColumn = pumpSessionColumns.some((column) => column.name === 'duration_seconds');
  if (!hasDurationColumn) {
    await db.execAsync(
      'ALTER TABLE pump_sessions ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0;'
    );
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}
