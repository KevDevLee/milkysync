import * as Notifications from 'expo-notifications';

import { NotificationService, ReminderNotificationInput } from '@/services/notifications/NotificationService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

export class LocalNotificationService implements NotificationService {
  async initialize(): Promise<void> {
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.granted) {
      return;
    }

    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) {
      throw new Error('Notification permission was not granted.');
    }
  }

  async scheduleReminder(input: ReminderNotificationInput): Promise<string> {
    const now = Date.now();
    // iOS can throw if a date trigger is in the past or too close to "now".
    const safeTimestamp = Math.max(input.at, now + 5_000);
    const triggerDate = new Date(safeTimestamp);

    return Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: input.data
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate
      }
    });
  }

  async cancelScheduled(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}
