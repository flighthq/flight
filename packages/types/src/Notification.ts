// A desktop/system notification request. Named NotificationRequest to avoid colliding with the lib.dom
// global `NotificationOptions`.
export interface NotificationAction {
  id: string;
  title: string;
  // Optional icon URL shown on the action button (native/SW backends only).
  icon?: string;
}

export interface NotificationRequest {
  title: string;
  // Stable caller-supplied id. When omitted the backend generates one and returns it.
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

// A notification channel/category. Load-bearing on Android-class native hosts (channels control
// importance, sound, and grouping); a no-op concept on the web.
export interface NotificationChannel {
  id: string;
  name: string;
}

// Tri-state notification permission, mirroring the web Notification API: 'default' (not yet asked),
// 'granted', or 'denied'.
export type NotificationPermission = 'default' | 'granted' | 'denied';

// Plain-data record of what a notification backend supports. Lets callers feature-detect without
// probing behavior.
export interface NotificationCapabilities {
  // Action buttons (requires the SW backend on web, or a native host).
  actions: boolean;
  // Notification channels/categories.
  channels: boolean;
  // Cold-start launch-from-notification reporting.
  coldStart: boolean;
  // Large body image.
  image: boolean;
  // Listing currently-active notifications.
  listActive: boolean;
  // Local scheduling for future delivery.
  scheduling: boolean;
  // Inline text-reply actions.
  textReply: boolean;
}

// A delivery schedule for a local notification: an absolute fire time plus an optional repeat cadence.
export interface NotificationSchedule {
  // Absolute fire time in epoch milliseconds.
  at: number;
  // Repeat cadence; omit for a one-shot schedule.
  repeat?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
}

// A locally-scheduled (not yet delivered) notification: the generated id, the original request, and
// the schedule it fires on.
export interface ScheduledNotification {
  id: string;
  request: Readonly<NotificationRequest>;
  schedule: Readonly<NotificationSchedule>;
}

// System notification seam. Free functions in @flighthq/notification delegate to the active backend
// (web Notification default, the Service Worker variant, or a native host's). notify resolves to the
// notification id ('' when permission is not granted or the host lacks the surface) and
// requestPermission resolves to a tri-state NotificationPermission rather than throwing — denial is an
// expected outcome, not an error.
export interface NotificationBackend {
  // Shows a notification; resolves to its id, or '' when not granted / unsupported.
  notify(request: Readonly<NotificationRequest>): Promise<string>;
  requestPermission(): Promise<NotificationPermission>;
  // Reads the current permission state without prompting.
  getPermission(): NotificationPermission;
  isSupported(): boolean;
  // Plain-data record of what this backend supports.
  getCapabilities(): NotificationCapabilities;
  // The notification the app was launched from, or null when not launched via a notification.
  getLaunchNotification(): Promise<Readonly<NotificationRequest> | null>;
  // Currently-displayed notifications; empty when introspection is unsupported.
  getActiveNotifications(): Promise<ReadonlyArray<Readonly<NotificationRequest>>>;
  // Locally-scheduled (not yet delivered) notifications.
  getPendingNotifications(): Promise<ReadonlyArray<Readonly<ScheduledNotification>>>;
  // Schedules a local notification; resolves to its id, or '' when unsupported.
  scheduleNotification(
    request: Readonly<NotificationRequest>,
    schedule: Readonly<NotificationSchedule>,
  ): Promise<string>;
  // Cancels a pending scheduled notification by id. No-ops when the id is unknown.
  cancelScheduledNotification(id: string): void;
  // Dismisses the notification with the given id. No-ops when unknown or already dismissed.
  closeNotification(id: string): void;
  // Dismisses all currently-shown notifications.
  closeAllNotifications(): void;
  // Updates a live notification by merging partial fields; resolves false when not visible or
  // updates are unsupported.
  updateNotification(id: string, partial: Readonly<Partial<NotificationRequest>>): Promise<boolean>;
  subscribeClick(listener: (id: string) => void): () => void;
  subscribeAction(listener: (id: string, actionId: string) => void): () => void;
  subscribeDismiss(listener: (id: string) => void): () => void;
  subscribeReply(listener: (id: string, actionId: string, text: string) => void): () => void;
  subscribeShow(listener: (id: string) => void): () => void;
}
