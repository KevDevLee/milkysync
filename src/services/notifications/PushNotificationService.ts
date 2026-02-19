import { NotificationService, ReminderNotificationInput } from '@/services/notifications/NotificationService';

// TODO: implement with Expo Push + backend worker for partner-device reminders.
export class PushNotificationService implements NotificationService {
  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  async scheduleReminder(_input: ReminderNotificationInput): Promise<string> {
    throw new Error('PushNotificationService is not implemented yet.');
  }

  async cancelScheduled(_notificationId: string): Promise<void> {
    throw new Error('PushNotificationService is not implemented yet.');
  }

  async cancelAll(): Promise<void> {
    throw new Error('PushNotificationService is not implemented yet.');
  }
}
