import { LocalNotificationService } from '@/services/notifications/LocalNotificationService';
import { NotificationService } from '@/services/notifications/NotificationService';

// Swap implementation later when cross-device push is ready.
export const notificationService: NotificationService = new LocalNotificationService();
