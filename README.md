# MilkySync

Offline-first Expo React Native app for pumping session tracking, family sharing, and reminder support.

## Chosen Stack

- Mobile: Expo (managed workflow) + React Native + TypeScript
- Navigation: React Navigation (native stack + bottom tabs)
- Local persistence: `expo-sqlite` (offline-first source of truth)
- Cloud backend: Supabase (Auth + Postgres)
- Sync strategy: local write-first, background push/pull sync, deterministic last-write-wins on `updatedAt`
- Notifications: local notifications now + push notification service stub for future partner-device reminders
- Tooling: ESLint, Prettier, Vitest

## Why Supabase (vs Firebase)

Supabase is a better fit for this MVP's relational data model (`family`, `users`, `sessions`, `invites`) and deterministic upsert-based sync with SQL + RLS.

## Prerequisites (Mac, Apple Silicon)

1. Node.js 20+ (`node -v`)
2. npm 10+ (`npm -v`)
3. Xcode + iOS Simulator
4. Android Studio + emulator (optional)
5. Expo CLI via `npx` (no global install required)

## Installation

```bash
git clone <your-repo-url> milkysync
cd milkysync
npm install
cp .env.example .env
```

Set env vars in `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Auth settings, for easier local dev, disable strict email confirmation (or use confirmed test users).
4. If you already created tables before this timer update, run `supabase/schema.sql` again to add `duration_seconds`.

## Run the App

### Expo (fastest)

```bash
npm run start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- scan QR for Expo Go (some notification behavior is limited in Expo Go)

### iOS Dev Build (recommended for notifications)

```bash
npx expo prebuild
npx expo run:ios
```

### iPhone via Xcode (without Expo Go, free Apple ID)

Use this when you want to install directly on your own iPhone over cable.

1. Connect iPhone to Mac with cable, unlock phone, trust computer.
2. Generate iOS project:
   ```bash
   npx expo prebuild --platform ios
   npx pod-install ios
   open ios/MilkySync.xcworkspace
   ```
3. In Xcode (`TARGETS > MilkySync > Signing & Capabilities`):
   - enable `Automatically manage signing`
   - select your `Personal Team`
   - keep bundle id unique (example: `com.kevinlee.milkysync.dev`)
4. Select your iPhone as run target and press `Run`.

Important for free Apple ID:
- Personal Team cannot sign `Push Notifications` capability.
- If signing fails, remove `Push Notifications` in Xcode and disable `Remote notifications` under `Background Modes`.
- Local notifications still work.

Notes:
- Free signing profiles expire after ~7 days; rebuild/install again when needed.
- This path is for personal testing, not public distribution.

### Android Dev Build

```bash
npx expo prebuild
npx expo run:android
```

## MVP Features Implemented

- Auth: sign up / log in / log out
- Home dashboard: daily total, last session, next reminder countdown, quick add
- Add session: left/right ml, timestamp picker, note
- Add session timer: start/stop pumping timer (max 2 hours) and save duration
- History: session list + daily total
- Settings: reminder interval + enable toggle + units + sync now
- Family pairing: generate invite code / join by invite code
- Offline-first local storage: SQLite with typed repositories
- Cloud sync: background sync on app open/foreground + manual sync in settings
- Notifications: local reminder scheduling after session save, architecture hook for push service

## Data Model

### PumpSession

- `id`
- `timestamp`
- `leftMl`
- `rightMl`
- `totalMl` (derived)
- `note`
- `durationSeconds` (0..7200)
- `createdAt`
- `updatedAt`
- `userId`
- `familyId`

### User

- `id`
- `email`
- `displayName`
- `familyId`
- `role` (`mother` | `partner` | `other`)
- `createdAt`

### ReminderSettings

- `intervalMinutes` (default `120`)
- `enabled`
- `quietHours` planned later

## Architecture Overview

- `src/db`: SQLite schema/migrations
- `src/repositories`: local data access layer (UI decoupled from storage)
- `src/services/auth`: Supabase auth + profile bootstrap
- `src/services/family`: invite code generation/join
- `src/services/sync`: local-first push/pull sync service
- `src/services/notifications`: interface + local impl + push stub
- `src/state`: app-level data context for screens/hooks
- `src/screens`: MVP UI screens

## Sync Details (MVP)

1. User action writes immediately to SQLite (`dirty = 1`).
2. Sync runs on app init, foreground resume, and manual trigger.
3. Push dirty records to Supabase.
4. Pull remote updates since `last_sync_<familyId>`.
5. Resolve conflicts with `updatedAt` (last-write-wins).

## Quality and Testing

```bash
npm run lint
npm run test
npm run assets:check
```

`npm run assets:check` validates PNG integrity (CRC), required files, and common size rules before device builds.

Current unit tests cover:
- totals/amount logic
- next reminder time calculation
- conflict resolution helper

## Troubleshooting

### Metro cache issues

```bash
rm -rf .expo
npm run start
```

### iOS build issues on Apple Silicon

- Ensure latest Xcode command line tools:
  ```bash
  xcode-select --install
  ```
- If native build fails after dependency changes:
  ```bash
  npx expo prebuild --clean
  npx expo run:ios
  ```

### Missing Supabase env vars

- Confirm `.env` exists at repo root.
- Restart Metro after changes.

## Phase Commit History

- `chore: scaffold expo typescript app with navigation and tooling`
- `feat: add local sqlite schema and typed repository layer`
- `feat: wire mvp screens to local sqlite data layer`
- `feat: integrate supabase auth and profile bootstrap`
- `feat: add family invite code pairing flow`
- `feat: implement local-first sync with background refresh`
- `feat: add reminder notification service and scheduling hooks`
