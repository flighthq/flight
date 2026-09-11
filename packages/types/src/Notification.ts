import type { Entity } from './Entity';
import type { Signal } from './Signal';

export interface NotificationAction {
  id: string;
  title: string;
  icon?: string;
}

export interface NotificationRequest {
  title: string;
  id?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  silent?: boolean;
  actions?: NotificationAction[];
  dir?: 'auto' | 'ltr' | 'rtl';
  image?: string;
  lang?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  timestamp?: number;
  vibrate?: ReadonlyArray<number>;
  data?: unknown;
}

export type NotificationRequestField = keyof NotificationRequest;
export type NotificationPermission = 'default' | 'granted' | 'denied';

export interface NotificationSchedule {
  at: number;
  repeat?: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
}

// Application-notification identity is an Entity. `id` is caller-facing diagnostic identity only;
// each provider keeps its native key in private state keyed by this object.
export interface Notification extends Entity {
  readonly id: string;
  readonly tag: string;
  readonly title: string;
}

export interface ScheduledNotification extends Entity {
  readonly id: string;
  readonly request: Readonly<NotificationRequest>;
  readonly schedule: Readonly<NotificationSchedule>;
}

export type NotificationPermissionQueryOutcome =
  | { readonly permission: NotificationPermission; readonly reason: 'ok' }
  | { readonly reason: 'operation-failed' };

export type NotificationPermissionRequestOutcome = {
  readonly reason: 'denied' | 'dismissed' | 'granted' | 'operation-failed';
};

export type NotificationDeliveryOutcome =
  | { readonly notification: Notification; readonly reason: 'accepted' }
  | {
      readonly fields: ReadonlyArray<NotificationRequestField>;
      readonly reason: 'invalid-request';
    }
  | { readonly reason: 'operation-failed' | 'permission-denied' };

export type NotificationScheduleOutcome =
  | {
      readonly precision: 'exact' | 'inexact';
      readonly reason: 'scheduled';
      readonly scheduled: ScheduledNotification;
    }
  | {
      readonly fields: ReadonlyArray<NotificationRequestField | 'at' | 'repeat'>;
      readonly reason: 'invalid-schedule';
    }
  | { readonly reason: 'operation-failed' | 'permission-denied' };

export type NotificationCloseOutcome = {
  readonly reason: 'already-closed' | 'ok' | 'operation-failed';
};
export type NotificationCancelOutcome = {
  readonly reason: 'already-cancelled' | 'ok' | 'operation-failed';
};

export type NotificationActiveListOutcome =
  | {
      readonly notifications: ReadonlyArray<Notification>;
      readonly reason: 'ok';
    }
  | { readonly reason: 'operation-failed' };

export type NotificationPendingListOutcome =
  | {
      readonly notifications: ReadonlyArray<ScheduledNotification>;
      readonly reason: 'ok';
    }
  | { readonly reason: 'operation-failed' };

export interface NotificationLifecycleFailure {
  readonly id: string;
  readonly operation: 'cancel' | 'close' | 'release';
}

export type NotificationLifecycleOutcome =
  | { readonly reason: 'already-destroyed' | 'ok' }
  | {
      readonly failures: ReadonlyArray<Readonly<NotificationLifecycleFailure>>;
      readonly reason: 'operation-failed';
    };

export type NotificationEventReleaseOutcome = {
  readonly reason: 'ok' | 'operation-failed';
};

export interface NotificationEventAttachment {
  release(): Promise<NotificationEventReleaseOutcome>;
}

export type NotificationEventBackendAttachOutcome =
  | { readonly attachment: NotificationEventAttachment; readonly reason: 'ok' }
  | { readonly reason: 'operation-failed'; readonly releaseFailed: boolean };

export type NotificationSubscriptionAttachOutcome =
  | { readonly reason: 'ok' }
  | {
      readonly attachFailed: boolean;
      readonly reason: 'operation-failed';
      readonly releaseFailed: boolean;
    };

export type NotificationSubscriptionDetachOutcome =
  | { readonly reason: 'not-attached' | 'ok' }
  | { readonly reason: 'operation-failed'; readonly releaseFailed: true };

export type NotificationSubscriptionDisposeOutcome =
  | { readonly reason: 'already-disposed' | 'ok' }
  | {
      readonly attachFailed: boolean;
      readonly reason: 'operation-failed';
      readonly releaseFailed: boolean;
    };

export interface NotificationActionSubscription extends Entity {
  readonly onNotificationAction: Signal<(notification: Readonly<Notification>, actionId: string) => void>;
}

export interface NotificationClickSubscription extends Entity {
  readonly onNotificationClick: Signal<(notification: Readonly<Notification>) => void>;
}

export interface NotificationDismissSubscription extends Entity {
  readonly onNotificationDismiss: Signal<(notification: Readonly<Notification>) => void>;
}

export interface NotificationReplySubscription extends Entity {
  readonly onNotificationReply: Signal<(notification: Readonly<Notification>, actionId: string, text: string) => void>;
}

export interface NotificationReceivedSubscription extends Entity {
  readonly onNotificationReceived: Signal<(notification: Readonly<Notification>) => void>;
}

export interface HostNotificationPermissionProvider {
  getPermission(): Promise<NotificationPermissionQueryOutcome>;
  requestPermission(): Promise<NotificationPermissionRequestOutcome>;
}

export interface HostNotificationDeliveryProvider {
  notify(request: Readonly<NotificationRequest>): Promise<NotificationDeliveryOutcome>;
}

export interface HostNotificationSchedulingProvider {
  cancelAllScheduledNotifications(): Promise<NotificationLifecycleOutcome>;
  getPendingNotifications(): Promise<NotificationPendingListOutcome>;
  scheduleNotification(
    request: Readonly<NotificationRequest>,
    schedule: Readonly<NotificationSchedule>,
  ): Promise<NotificationScheduleOutcome>;
}

export interface HostNotificationCloseProvider {
  closeAllNotifications(): Promise<NotificationLifecycleOutcome>;
}

export interface HostNotificationActiveListProvider {
  getActiveNotifications(): Promise<NotificationActiveListOutcome>;
}

export interface HostNotificationActionProvider {
  attach(
    listener: (notification: Readonly<Notification>, actionId: string) => void,
  ): Promise<NotificationEventBackendAttachOutcome>;
}

export interface HostNotificationClickProvider {
  attach(listener: (notification: Readonly<Notification>) => void): Promise<NotificationEventBackendAttachOutcome>;
}

export interface HostNotificationDismissProvider {
  attach(listener: (notification: Readonly<Notification>) => void): Promise<NotificationEventBackendAttachOutcome>;
}

export interface HostNotificationReplyProvider {
  attach(
    listener: (notification: Readonly<Notification>, actionId: string, text: string) => void,
  ): Promise<NotificationEventBackendAttachOutcome>;
}

export interface HostNotificationReceivedProvider {
  attach(listener: (notification: Readonly<Notification>) => void): Promise<NotificationEventBackendAttachOutcome>;
}

export interface HostNotificationLifecycleProvider {
  destroy(): Promise<NotificationLifecycleOutcome>;
}

export type WebPageNotificationCapabilities = Entity &
  Readonly<{
    click: HostNotificationClickProvider;
    close: HostNotificationCloseProvider;
    delivery: HostNotificationDeliveryProvider;
    dismiss: HostNotificationDismissProvider;
    lifecycle: HostNotificationLifecycleProvider;
    permission: HostNotificationPermissionProvider;
    received: HostNotificationReceivedProvider;
  }>;

export type WebServiceWorkerNotificationCapabilities = Entity &
  Readonly<{
    action: HostNotificationActionProvider;
    activeList: HostNotificationActiveListProvider;
    click: HostNotificationClickProvider;
    close: HostNotificationCloseProvider;
    delivery: HostNotificationDeliveryProvider;
    dismiss: HostNotificationDismissProvider;
    lifecycle: HostNotificationLifecycleProvider;
    permission: HostNotificationPermissionProvider;
  }>;

export type ElectronNotificationCapabilities = Entity &
  Readonly<{
    click: HostNotificationClickProvider;
    close: HostNotificationCloseProvider;
    delivery: HostNotificationDeliveryProvider;
    dismiss: HostNotificationDismissProvider;
    lifecycle: HostNotificationLifecycleProvider;
    received: HostNotificationReceivedProvider;
  }>;

export type ElectronMacosNotificationCapabilities = ElectronNotificationCapabilities &
  Readonly<{
    action: HostNotificationActionProvider;
    reply: HostNotificationReplyProvider;
  }>;

export type TauriNotificationCapabilities = Entity &
  Readonly<{
    delivery: HostNotificationDeliveryProvider;
    lifecycle: HostNotificationLifecycleProvider;
    permission: HostNotificationPermissionProvider;
  }>;

export type CapacitorNotificationCapabilities = Entity &
  Readonly<{
    action: HostNotificationActionProvider;
    click: HostNotificationClickProvider;
    delivery: HostNotificationDeliveryProvider;
    lifecycle: HostNotificationLifecycleProvider;
    permission: HostNotificationPermissionProvider;
    scheduling: HostNotificationSchedulingProvider;
  }>;

export interface WebNotificationOptions {
  actions?: ReadonlyArray<Readonly<{ action: string; icon?: string; title: string }>>;
  badge?: string;
  body?: string;
  data?: unknown;
  dir?: 'auto' | 'ltr' | 'rtl';
  icon?: string;
  image?: string;
  lang?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  tag?: string;
  timestamp?: number;
  vibrate?: ReadonlyArray<number>;
}

export interface WebPageNotificationInstance {
  close(): void;
  onclick: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onshow: (() => void) | null;
}

export interface WebPageNotificationApi {
  readonly Notification: {
    new (title: string, options?: Readonly<WebNotificationOptions>): WebPageNotificationInstance;
    readonly permission: NotificationPermission;
    requestPermission(): Promise<NotificationPermission>;
  };
}

export interface WebServiceWorkerNotificationInstance {
  readonly data?: unknown;
  readonly tag: string;
  readonly title: string;
  close(): void;
}

export interface WebServiceWorkerNotificationRegistration {
  getNotifications(filter?: Readonly<{ tag?: string }>): Promise<ReadonlyArray<WebServiceWorkerNotificationInstance>>;
  showNotification(title: string, options?: Readonly<WebNotificationOptions>): Promise<void>;
}

export interface WebServiceWorkerNotificationApi {
  readonly permission: {
    getPermission(): NotificationPermission;
    requestPermission(): Promise<NotificationPermission>;
  };
  readonly registration: WebServiceWorkerNotificationRegistration;
}

export interface WebServiceWorkerNotificationEvent {
  readonly actionId?: string;
  readonly notificationTag: string;
  readonly type: 'notificationclick' | 'notificationclose';
}
