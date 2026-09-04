import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  bindScheduledNotificationCancel,
  createNotificationResource,
  createScheduledNotificationResource,
} from '@flighthq/notification/contract';
import type {
  CapacitorApi,
  CapacitorLocalNotificationAction,
  CapacitorLocalNotificationSchema,
  CapacitorNotificationCapabilities,
  Notification,
  NotificationEventAttachment,
  NotificationEventBackendAttachOutcome,
  NotificationLifecycleFailure,
  NotificationLifecycleOutcome,
  NotificationRequest,
  NotificationRequestField,
  NotificationSchedule,
  ScheduledNotification,
} from '@flighthq/types/contract';

export function createCapacitorNotificationCapabilities(capacitor: CapacitorApi): CapacitorNotificationCapabilities {
  const notifications = capacitor.localNotifications;
  const notificationByNumber = new Map<number, Notification>();
  const scheduledByNumber = new Map<number, ScheduledNotification>();
  const numberByScheduled = new WeakMap<ScheduledNotification, number>();
  const liveAttachments = new Map<NotificationEventAttachment, string>();
  let destroyed = false;
  let destroyCompleted = false;
  let nextAttachmentId = 1;
  let nextNumericId = 1;

  function getNotification(number: number): Notification {
    let notification = notificationByNumber.get(number);
    if (notification === undefined) {
      notification = createNotificationResource(`capacitor-notification-${number}`, '');
      notificationByNumber.set(number, notification);
    }
    return notification;
  }

  function trackScheduled(number: number, scheduled: ScheduledNotification): void {
    scheduledByNumber.set(number, scheduled);
    numberByScheduled.set(scheduled, number);
    bindScheduledNotificationCancel(scheduled, () => cancelOne(scheduled));
  }

  async function cancelOne(scheduled: ScheduledNotification) {
    const number = numberByScheduled.get(scheduled);
    if (number === undefined || scheduledByNumber.get(number) !== scheduled) {
      return { reason: 'already-cancelled' } as const;
    }
    try {
      await notifications.cancel({ notifications: [{ id: number }] });
    } catch {
      return { reason: 'operation-failed' } as const;
    }
    scheduledByNumber.delete(number);
    numberByScheduled.delete(scheduled);
    return { reason: 'ok' } as const;
  }

  async function cancelAll(): Promise<NotificationLifecycleOutcome> {
    const failures: NotificationLifecycleFailure[] = [];
    for (const scheduled of [...scheduledByNumber.values()]) {
      const outcome = await cancelOne(scheduled);
      if (outcome.reason === 'operation-failed') failures.push({ id: scheduled.id, operation: 'cancel' });
    }
    return failures.length === 0 ? { reason: 'ok' } : { failures, reason: 'operation-failed' };
  }

  async function attachEvent(
    listener: (action: Readonly<CapacitorLocalNotificationAction>) => void,
  ): Promise<NotificationEventBackendAttachOutcome> {
    if (destroyed) return { reason: 'operation-failed', releaseFailed: false };
    let handle;
    try {
      handle = await notifications.addListener('localNotificationActionPerformed', listener);
    } catch {
      return { reason: 'operation-failed', releaseFailed: false };
    }
    let released = false;
    const attachment: NotificationEventAttachment = {
      async release() {
        if (released) return { reason: 'ok' };
        try {
          await handle.remove();
        } catch {
          return { reason: 'operation-failed' };
        }
        released = true;
        liveAttachments.delete(attachment);
        return { reason: 'ok' };
      },
    };
    liveAttachments.set(attachment, `subscription-${nextAttachmentId++}`);
    return { attachment, reason: 'ok' };
  }

  return createEntity({
    action: {
      attach(listener) {
        return attachEvent((action) => listener(getNotification(action.notification.id), action.actionId));
      },
    },
    click: {
      attach(listener) {
        return attachEvent((action) => {
          if (action.actionId === 'tap') listener(getNotification(action.notification.id));
        });
      },
    },
    delivery: {
      async notify(request) {
        if (destroyed) return { reason: 'operation-failed' };
        const invalid = getCapacitorInvalidNotificationRequestFields(request);
        if (invalid.length > 0) return { fields: invalid, reason: 'invalid-request' };
        let permission;
        try {
          permission = (await notifications.checkPermissions()).display;
        } catch {
          return { reason: 'operation-failed' };
        }
        if (permission !== 'granted') return { reason: 'permission-denied' };
        const number = nextNumericId++;
        let result;
        try {
          result = await notifications.schedule({
            notifications: [{ body: request.body, id: number, title: request.title }],
          });
        } catch {
          return { reason: 'operation-failed' };
        }
        if (!result.notifications.some((entry) => entry.id === number)) return { reason: 'operation-failed' };
        const notification = createNotificationResource(
          request.id ?? `capacitor-notification-${number}`,
          request.title,
        );
        notificationByNumber.set(number, notification);
        return { notification, reason: 'accepted' };
      },
    },
    lifecycle: {
      async destroy() {
        if (destroyCompleted) return { reason: 'already-destroyed' };
        destroyed = true;
        const failures: NotificationLifecycleFailure[] = [];
        const cancellation = await cancelAll();
        if (cancellation.reason === 'operation-failed') failures.push(...cancellation.failures);
        for (const [attachment, id] of [...liveAttachments]) {
          const outcome = await attachment.release();
          if (outcome.reason === 'operation-failed') failures.push({ id, operation: 'release' });
        }
        if (failures.length > 0) return { failures, reason: 'operation-failed' };
        notificationByNumber.clear();
        destroyCompleted = true;
        return { reason: 'ok' };
      },
    },
    permission: {
      async getPermission() {
        try {
          return {
            permission: toNotificationPermission((await notifications.checkPermissions()).display),
            reason: 'ok',
          };
        } catch {
          return { reason: 'operation-failed' };
        }
      },
      async requestPermission() {
        try {
          const permission = toNotificationPermission((await notifications.requestPermissions()).display);
          return {
            reason: permission === 'default' ? 'dismissed' : permission,
          };
        } catch {
          return { reason: 'operation-failed' };
        }
      },
    },
    scheduling: {
      cancelAllScheduledNotifications: cancelAll,
      async getPendingNotifications() {
        let pending;
        try {
          pending = await notifications.getPending();
        } catch {
          return { reason: 'operation-failed' };
        }
        const values = pending.notifications.map((schema) => {
          let scheduled = scheduledByNumber.get(schema.id);
          if (scheduled === undefined) {
            const id = `capacitor-scheduled-notification-${schema.id}`;
            const request = { body: schema.body, id, title: schema.title };
            const schedule = {
              at: schema.schedule?.at?.getTime() ?? 0,
              repeat: toNotificationRepeat(schema.schedule?.every),
            };
            scheduled = createScheduledNotificationResource(id, request, schedule);
            trackScheduled(schema.id, scheduled);
          }
          return scheduled;
        });
        return { notifications: values, reason: 'ok' };
      },
      async scheduleNotification(request, schedule) {
        if (destroyed) return { reason: 'operation-failed' };
        const invalid = getCapacitorInvalidScheduleFields(request, schedule);
        if (invalid.length > 0) return { fields: invalid, reason: 'invalid-schedule' };
        let permission;
        try {
          permission = (await notifications.checkPermissions()).display;
        } catch {
          return { reason: 'operation-failed' };
        }
        if (permission !== 'granted') return { reason: 'permission-denied' };
        const number = nextNumericId++;
        const schema: CapacitorLocalNotificationSchema = {
          body: request.body,
          id: number,
          schedule: {
            at: new Date(schedule.at),
            every: schedule.repeat,
            repeats: schedule.repeat !== undefined,
          },
          title: request.title,
        };
        let result;
        try {
          result = await notifications.schedule({ notifications: [schema] });
        } catch {
          return { reason: 'operation-failed' };
        }
        if (!result.notifications.some((entry) => entry.id === number)) return { reason: 'operation-failed' };
        const scheduled = createScheduledNotificationResource(
          request.id ?? `capacitor-scheduled-notification-${number}`,
          request,
          schedule,
        );
        trackScheduled(number, scheduled);
        return { precision: 'inexact', reason: 'scheduled', scheduled };
      },
    },
  });
}

function getCapacitorInvalidNotificationRequestFields(
  request: Readonly<NotificationRequest>,
): NotificationRequestField[] {
  const allowed = new Set<NotificationRequestField>(['body', 'id', 'title']);
  return (Object.keys(request) as NotificationRequestField[]).filter(
    (field) => request[field] !== undefined && !allowed.has(field),
  );
}

function getCapacitorInvalidScheduleFields(
  request: Readonly<NotificationRequest>,
  schedule: Readonly<NotificationSchedule>,
): Array<NotificationRequestField | 'at' | 'repeat'> {
  const fields: Array<NotificationRequestField | 'at' | 'repeat'> =
    getCapacitorInvalidNotificationRequestFields(request);
  if (!Number.isFinite(schedule.at)) fields.push('at');
  return fields;
}

function toNotificationPermission(display: string) {
  if (display === 'granted') return 'granted' as const;
  if (display === 'denied') return 'denied' as const;
  return 'default' as const;
}

function toNotificationRepeat(value: string | undefined): NotificationSchedule['repeat'] {
  switch (value) {
    case 'minute':
    case 'hour':
    case 'day':
    case 'week':
    case 'month':
    case 'year':
      return value;
    default:
      return undefined;
  }
}
