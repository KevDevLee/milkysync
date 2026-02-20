export type UserRole = 'mother' | 'partner' | 'other';

export type PumpSession = {
  id: string;
  timestamp: number;
  leftMl: number;
  rightMl: number;
  totalMl: number;
  durationSeconds: number;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  userId: string;
  familyId: string;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string | null;
  familyId: string | null;
  role: UserRole;
  createdAt: number;
  updatedAt: number;
};

export type ReminderSettings = {
  id: string;
  userId: string;
  intervalMinutes: number;
  enabled: boolean;
  updatedAt: number;
};
