import { createEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  HasNotificationAction,
  HasNotificationActiveList,
  HasNotificationClick,
  HasNotificationClose,
  HasNotificationDelivery,
  HasNotificationDismiss,
  HasNotificationLifecycle,
  HasNotificationPermission,
  HasNotificationReceived,
  HasNotificationReply,
  HasNotificationScheduling,
  Notification,
  NotificationActionSubscription,
  NotificationActiveListOutcome,
  NotificationCancelOutcome,
  NotificationClickSubscription,
  NotificationCloseOutcome,
  NotificationDeliveryOutcome,
  NotificationDismissSubscription,
  NotificationEventAttachment,
  NotificationEventBackendAttachOutcome,
  NotificationLifecycleOutcome,
  NotificationPendingListOutcome,
  NotificationPermissionQueryOutcome,
  NotificationPermissionRequestOutcome,
  NotificationReceivedSubscription,
  NotificationReplySubscription,
  NotificationRequest,
  NotificationSchedule,
  NotificationScheduleOutcome,
  NotificationSubscriptionAttachOutcome,
  NotificationSubscriptionDetachOutcome,
  NotificationSubscriptionDisposeOutcome,
  ScheduledNotification,
  Signal,
} from '@flighthq/types/contract';

export async function attachNotificationActionSubscription(
  host: HasNotificationAction,
  subscription: NotificationActionSubscription,
): Promise<NotificationSubscriptionAttachOutcome> {
  return attachNotificationSubscription(
    subscription,
    (listener) => host.notification.action.attach(listener),
    (notification: Readonly<Notification>, actionId: string) =>
      emitSignal(subscription.onNotificationAction, notification, actionId),
  );
}

export async function attachNotificationClickSubscription(
  host: HasNotificationClick,
  subscription: NotificationClickSubscription,
): Promise<NotificationSubscriptionAttachOutcome> {
  return attachNotificationSubscription(
    subscription,
    (listener) => host.notification.click.attach(listener),
    (notification: Readonly<Notification>) => emitSignal(subscription.onNotificationClick, notification),
  );
}

export async function attachNotificationDismissSubscription(
  host: HasNotificationDismiss,
  subscription: NotificationDismissSubscription,
): Promise<NotificationSubscriptionAttachOutcome> {
  return attachNotificationSubscription(
    subscription,
    (listener) => host.notification.dismiss.attach(listener),
    (notification: Readonly<Notification>) => emitSignal(subscription.onNotificationDismiss, notification),
  );
}

export async function attachNotificationReceivedSubscription(
  host: HasNotificationReceived,
  subscription: NotificationReceivedSubscription,
): Promise<NotificationSubscriptionAttachOutcome> {
  return attachNotificationSubscription(
    subscription,
    (listener) => host.notification.received.attach(listener),
    (notification: Readonly<Notification>) => emitSignal(subscription.onNotificationReceived, notification),
  );
}

export async function attachNotificationReplySubscription(
  host: HasNotificationReply,
  subscription: NotificationReplySubscription,
): Promise<NotificationSubscriptionAttachOutcome> {
  return attachNotificationSubscription(
    subscription,
    (listener) => host.notification.reply.attach(listener),
    (notification: Readonly<Notification>, actionId: string, text: string) =>
      emitSignal(subscription.onNotificationReply, notification, actionId, text),
  );
}

// Provider-contract hook: binds one public Entity to the exact native close operation that created it.
// Kept out of the package root; host providers consume it from /contract.
export function bindNotificationClose(
  notification: Notification,
  close: () => Promise<NotificationCloseOutcome>,
): void {
  _notificationClose.set(notification, close);
}

// Provider-contract hook: same origin pin for one scheduled native resource.
export function bindScheduledNotificationCancel(
  scheduled: ScheduledNotification,
  cancel: () => Promise<NotificationCancelOutcome>,
): void {
  _scheduledNotificationCancel.set(scheduled, cancel);
}

export async function cancelScheduledNotification(
  scheduled: ScheduledNotification,
): Promise<NotificationCancelOutcome> {
  if (_cancelledScheduledNotifications.has(scheduled)) return { reason: 'already-cancelled' };
  const cancel = _scheduledNotificationCancel.get(scheduled);
  if (cancel === undefined) return { reason: 'operation-failed' };
  let outcome: NotificationCancelOutcome;
  try {
    outcome = await cancel();
  } catch {
    outcome = { reason: 'operation-failed' };
  }
  if (outcome.reason === 'ok' || outcome.reason === 'already-cancelled') {
    _scheduledNotificationCancel.delete(scheduled);
    _cancelledScheduledNotifications.add(scheduled);
  }
  return outcome;
}

export function closeAllNotifications(host: HasNotificationClose): Promise<NotificationLifecycleOutcome> {
  return host.notification.close.closeAllNotifications();
}

export async function closeNotification(notification: Notification): Promise<NotificationCloseOutcome> {
  if (_closedNotifications.has(notification)) return { reason: 'already-closed' };
  const close = _notificationClose.get(notification);
  if (close === undefined) return { reason: 'operation-failed' };
  let outcome: NotificationCloseOutcome;
  try {
    outcome = await close();
  } catch {
    outcome = { reason: 'operation-failed' };
  }
  if (outcome.reason === 'ok' || outcome.reason === 'already-closed') {
    _notificationClose.delete(notification);
    _closedNotifications.add(notification);
  }
  return outcome;
}

export function createNotificationActionSubscription(): NotificationActionSubscription {
  return createNotificationSubscription({
    onNotificationAction: createSignal(),
  });
}

export function createNotificationClickSubscription(): NotificationClickSubscription {
  return createNotificationSubscription({
    onNotificationClick: createSignal(),
  });
}

export function createNotificationDismissSubscription(): NotificationDismissSubscription {
  return createNotificationSubscription({
    onNotificationDismiss: createSignal(),
  });
}

export function createNotificationReceivedSubscription(): NotificationReceivedSubscription {
  return createNotificationSubscription({
    onNotificationReceived: createSignal(),
  });
}

export function createNotificationReplySubscription(): NotificationReplySubscription {
  return createNotificationSubscription({
    onNotificationReply: createSignal(),
  });
}

// Provider-contract constructor. Provider-local native keys never enter this public Entity.
export function createNotificationResource(id: string, title: string, tag: string = ''): Notification {
  return createEntity({ id, tag, title });
}

// Provider-contract constructor for one pending native schedule.
export function createScheduledNotificationResource(
  id: string,
  request: Readonly<NotificationRequest>,
  schedule: Readonly<NotificationSchedule>,
): ScheduledNotification {
  return createEntity({ id, request, schedule });
}

export function destroyNotificationCapabilities(host: HasNotificationLifecycle): Promise<NotificationLifecycleOutcome> {
  return host.notification.lifecycle.destroy();
}

export function detachNotificationActionSubscription(
  subscription: NotificationActionSubscription,
): Promise<NotificationSubscriptionDetachOutcome> {
  return detachNotificationSubscription(subscription);
}

export function detachNotificationClickSubscription(
  subscription: NotificationClickSubscription,
): Promise<NotificationSubscriptionDetachOutcome> {
  return detachNotificationSubscription(subscription);
}

export function detachNotificationDismissSubscription(
  subscription: NotificationDismissSubscription,
): Promise<NotificationSubscriptionDetachOutcome> {
  return detachNotificationSubscription(subscription);
}

export function detachNotificationReceivedSubscription(
  subscription: NotificationReceivedSubscription,
): Promise<NotificationSubscriptionDetachOutcome> {
  return detachNotificationSubscription(subscription);
}

export function detachNotificationReplySubscription(
  subscription: NotificationReplySubscription,
): Promise<NotificationSubscriptionDetachOutcome> {
  return detachNotificationSubscription(subscription);
}

export async function disposeNotificationActionSubscription(
  subscription: NotificationActionSubscription,
): Promise<NotificationSubscriptionDisposeOutcome> {
  return disposeNotificationSubscription(subscription, subscription.onNotificationAction);
}

export async function disposeNotificationClickSubscription(
  subscription: NotificationClickSubscription,
): Promise<NotificationSubscriptionDisposeOutcome> {
  return disposeNotificationSubscription(subscription, subscription.onNotificationClick);
}

export async function disposeNotificationDismissSubscription(
  subscription: NotificationDismissSubscription,
): Promise<NotificationSubscriptionDisposeOutcome> {
  return disposeNotificationSubscription(subscription, subscription.onNotificationDismiss);
}

export async function disposeNotificationReceivedSubscription(
  subscription: NotificationReceivedSubscription,
): Promise<NotificationSubscriptionDisposeOutcome> {
  return disposeNotificationSubscription(subscription, subscription.onNotificationReceived);
}

export async function disposeNotificationReplySubscription(
  subscription: NotificationReplySubscription,
): Promise<NotificationSubscriptionDisposeOutcome> {
  return disposeNotificationSubscription(subscription, subscription.onNotificationReply);
}

export function getActiveNotifications(host: HasNotificationActiveList): Promise<NotificationActiveListOutcome> {
  return host.notification.activeList.getActiveNotifications();
}

export function getNotificationPermission(
  host: HasNotificationPermission,
): Promise<NotificationPermissionQueryOutcome> {
  return host.notification.permission.getPermission();
}

export function getPendingNotifications(host: HasNotificationScheduling): Promise<NotificationPendingListOutcome> {
  return host.notification.scheduling.getPendingNotifications();
}

export function requestNotificationPermission(
  host: HasNotificationPermission,
): Promise<NotificationPermissionRequestOutcome> {
  return host.notification.permission.requestPermission();
}

export function scheduleNotification(
  host: HasNotificationScheduling,
  request: Readonly<NotificationRequest>,
  schedule: Readonly<NotificationSchedule>,
): Promise<NotificationScheduleOutcome> {
  return host.notification.scheduling.scheduleNotification(request, schedule);
}

export function showNotification(
  host: HasNotificationDelivery,
  request: Readonly<NotificationRequest>,
): Promise<NotificationDeliveryOutcome> {
  return host.notification.delivery.notify(request);
}

type NotificationAttach<TArgs extends unknown[]> = (
  listener: (...args: TArgs) => void,
) => Promise<NotificationEventBackendAttachOutcome>;

interface NotificationSubscriptionRuntime {
  attachment: NotificationEventAttachment | null;
  disposeCompleted: boolean;
  disposed: boolean;
  generation: number;
  pending: Promise<NotificationEventBackendAttachOutcome> | null;
}

function createNotificationSubscription<TSubscription extends Entity>(
  fields: Omit<TSubscription, keyof Entity>,
): TSubscription {
  const subscription = createEntity(fields) as TSubscription;
  _notificationSubscriptions.set(subscription, {
    attachment: null,
    disposeCompleted: false,
    disposed: false,
    generation: 0,
    pending: null,
  });
  return subscription;
}

async function attachNotificationSubscription<TSubscription extends Entity, TArgs extends unknown[]>(
  subscription: TSubscription,
  attach: NotificationAttach<TArgs>,
  listener: (...args: TArgs) => void,
): Promise<NotificationSubscriptionAttachOutcome> {
  const runtime = _notificationSubscriptions.get(subscription);
  if (runtime === undefined || runtime.disposed) {
    return {
      attachFailed: true,
      reason: 'operation-failed',
      releaseFailed: false,
    };
  }
  const detached = await detachNotificationSubscription(subscription);
  if (detached.reason === 'operation-failed') {
    return {
      attachFailed: false,
      reason: 'operation-failed',
      releaseFailed: true,
    };
  }
  const generation = ++runtime.generation;
  let pending: Promise<NotificationEventBackendAttachOutcome>;
  try {
    pending = attach(listener);
  } catch {
    return {
      attachFailed: true,
      reason: 'operation-failed',
      releaseFailed: false,
    };
  }
  runtime.pending = pending;
  let outcome: NotificationEventBackendAttachOutcome;
  try {
    outcome = await pending;
  } catch {
    outcome = { reason: 'operation-failed', releaseFailed: false };
  }
  if (runtime.pending === pending) runtime.pending = null;
  if (outcome.reason === 'operation-failed') {
    return {
      attachFailed: true,
      reason: 'operation-failed',
      releaseFailed: outcome.releaseFailed,
    };
  }
  if (runtime.disposed || runtime.generation !== generation) {
    const release = await releaseNotificationAttachment(outcome.attachment);
    return release.reason === 'ok'
      ? { reason: 'ok' }
      : {
          attachFailed: false,
          reason: 'operation-failed',
          releaseFailed: true,
        };
  }
  runtime.attachment = outcome.attachment;
  return { reason: 'ok' };
}

async function detachNotificationSubscription(subscription: Entity): Promise<NotificationSubscriptionDetachOutcome> {
  const runtime = _notificationSubscriptions.get(subscription);
  if (runtime === undefined || runtime.attachment === null) return { reason: 'not-attached' };
  const attachment = runtime.attachment;
  const outcome = await releaseNotificationAttachment(attachment);
  if (outcome.reason === 'operation-failed') return { reason: 'operation-failed', releaseFailed: true };
  runtime.attachment = null;
  return { reason: 'ok' };
}

async function disposeNotificationSubscription<TArgs extends unknown[]>(
  subscription: Entity,
  signal: Signal<(...args: TArgs) => void>,
): Promise<NotificationSubscriptionDisposeOutcome> {
  const runtime = _notificationSubscriptions.get(subscription);
  if (runtime === undefined || runtime.disposeCompleted) return { reason: 'already-disposed' };
  runtime.disposed = true;
  runtime.generation++;
  let attachFailed = false;
  let releaseFailed = false;
  if (runtime.pending !== null) {
    let outcome: NotificationEventBackendAttachOutcome;
    try {
      outcome = await runtime.pending;
    } catch {
      outcome = { reason: 'operation-failed', releaseFailed: false };
    }
    if (outcome.reason === 'operation-failed') {
      attachFailed = true;
      releaseFailed = outcome.releaseFailed;
    }
  }
  const detached = await detachNotificationSubscription(subscription);
  if (detached.reason === 'operation-failed') releaseFailed = true;
  clearSignal(signal);
  if (attachFailed || releaseFailed) return { attachFailed, reason: 'operation-failed', releaseFailed };
  runtime.disposeCompleted = true;
  return { reason: 'ok' };
}

async function releaseNotificationAttachment(attachment: NotificationEventAttachment) {
  try {
    return await attachment.release();
  } catch {
    return { reason: 'operation-failed' } as const;
  }
}

const _notificationClose = new WeakMap<Notification, () => Promise<NotificationCloseOutcome>>();
const _closedNotifications = new WeakSet<Notification>();
const _scheduledNotificationCancel = new WeakMap<ScheduledNotification, () => Promise<NotificationCancelOutcome>>();
const _cancelledScheduledNotifications = new WeakSet<ScheduledNotification>();
const _notificationSubscriptions = new WeakMap<Entity, NotificationSubscriptionRuntime>();
