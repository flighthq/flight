// A desktop/system notification request. Named NotificationRequest to avoid colliding with the lib.dom
// global `NotificationOptions`.
export interface NotificationAction {
  id: string;
  title: string;
  // Optional icon URL shown on the action button (native/SW providers only).
  icon?: string;
}

export interface NotificationRequest {
  title: string;
  // Stable caller-supplied id. When omitted the provider generates one and returns it on the handle.
  id?: string;
  body?: string;
  icon?: string;
  // Small monochrome badge shown in some platforms' status bars.
  badge?: string;
  tag?: string;
  silent?: boolean;
  actions?: NotificationAction[];
  // Text direction for the notification body.
  dir?: 'auto' | 'ltr' | 'rtl';
  // Large image displayed in the notification body.
  image?: string;
  // BCP 47 language tag for the notification text.
  lang?: string;
  // When true, re-showing a notification with the same tag re-alerts the user.
  renotify?: boolean;
  // When true, the notification stays visible until the user interacts with it.
  requireInteraction?: boolean;
  // Delivery/creation timestamp in epoch milliseconds.
  timestamp?: number;
  // Vibration pattern in milliseconds (on/off durations).
  vibrate?: ReadonlyArray<number>;
  // Opaque caller payload echoed back through the notification lifecycle.
  data?: unknown;
}

// Tri-state notification permission, mirroring the web Notification API: 'default' (not yet asked),
// 'granted', or 'denied'. Permission reads are async because native providers expose async probes.
export type NotificationPermission = 'default' | 'granted' | 'denied';

// A delivery schedule for a local notification: an absolute fire time plus an optional repeat cadence.
export interface NotificationSchedule {
  // Absolute fire time in epoch milliseconds.
  at: number;
  // Repeat cadence; omit for a one-shot schedule.
  repeat?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
}

// Public identity for one displayed notification. APIs create a fresh handle object and retain the
// originating provider out-of-band, so equal provider-local strings from different hosts cannot redirect
// close or update operations.
export interface NotificationHandle {
  readonly id: string;
}

// Truthful summary returned by providers that can enumerate displayed notifications. It deliberately
// contains only fields every declared active-list provider can recover from the platform.
export interface ActiveNotification extends NotificationHandle {
  readonly tag: string;
  readonly title: string;
}

export interface ScheduledNotificationHandle {
  readonly id: string;
}

// A locally-scheduled (not yet delivered) notification. This is also a cancellable public handle;
// getPendingNotifications pins each returned object to the scheduling provider that enumerated it.
export interface ScheduledNotification extends ScheduledNotificationHandle {
  readonly request: Readonly<NotificationRequest>;
  readonly schedule: Readonly<NotificationSchedule>;
}

export interface NotificationDeliveryBackend {
  // Shows a notification; resolves to its provider-local id, or null when permission is not granted or
  // the runtime API rejects the request.
  notify(request: Readonly<NotificationRequest>): Promise<string | null>;
  getPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
}

export interface NotificationSchedulingBackend {
  cancelScheduledNotification(id: string): Promise<void>;
  getPendingNotifications(): Promise<ReadonlyArray<Readonly<ScheduledNotification>>>;
  scheduleNotification(
    request: Readonly<NotificationRequest>,
    schedule: Readonly<NotificationSchedule>,
  ): Promise<string | null>;
}

export interface NotificationCloseBackend {
  closeNotification(id: string): Promise<void>;
  closeAllNotifications(): Promise<void>;
}

export interface NotificationUpdateBackend {
  updateNotification(id: string, partial: Readonly<Partial<NotificationRequest>>): Promise<boolean>;
}

export interface NotificationActiveListBackend {
  getActiveNotifications(): Promise<ReadonlyArray<Readonly<ActiveNotification>>>;
}

export interface NotificationClickBackend {
  subscribe(listener: (id: string) => void): void;
  unsubscribe(listener: (id: string) => void): void;
}

export interface NotificationActionBackend {
  subscribe(listener: (id: string, actionId: string) => void): void;
  unsubscribe(listener: (id: string, actionId: string) => void): void;
}

export interface NotificationDismissBackend {
  subscribe(listener: (id: string) => void): void;
  unsubscribe(listener: (id: string) => void): void;
}

export interface NotificationReplyBackend {
  subscribe(listener: (id: string, actionId: string, text: string) => void): void;
  unsubscribe(listener: (id: string, actionId: string, text: string) => void): void;
}

export interface NotificationShowBackend {
  subscribe(listener: (id: string) => void): void;
  unsubscribe(listener: (id: string) => void): void;
}

export type ServiceWorkerNotificationCapabilities = Readonly<{
  action: NotificationActionBackend;
  activeList: NotificationActiveListBackend;
  click: NotificationClickBackend;
  close: NotificationCloseBackend;
  delivery: NotificationDeliveryBackend;
  dismiss: NotificationDismissBackend;
  reply: NotificationReplyBackend;
  scheduling: NotificationSchedulingBackend;
  show: NotificationShowBackend;
}>;

export type WebNotificationCapabilities = Readonly<{
  click: NotificationClickBackend;
  close: NotificationCloseBackend;
  delivery: NotificationDeliveryBackend;
  dismiss: NotificationDismissBackend;
  scheduling: NotificationSchedulingBackend;
  show: NotificationShowBackend;
  update: NotificationUpdateBackend;
}>;
