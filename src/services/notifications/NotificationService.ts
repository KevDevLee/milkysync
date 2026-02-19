export type ReminderNotificationInput = {
  at: number;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export interface NotificationService {
  initialize(): Promise<void>;
  scheduleReminder(input: ReminderNotificationInput): Promise<string>;
  cancelScheduled(notificationId: string): Promise<void>;
  cancelAll(): Promise<void>;
}
