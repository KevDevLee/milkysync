import * as Notifications from 'expo-notifications';

import { NotificationService, ReminderNotificationInput } from '@/services/notifications/NotificationService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
    const triggerDate = new Date(input.at);

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
