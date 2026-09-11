import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { bindNotificationClose, createNotificationResource } from '@flighthq/notification/contract';
import type {
  ElectronApi,
  ElectronHostOptions,
  ElectronMacosNotificationCapabilities,
  ElectronNotification,
  ElectronNotificationCapabilities,
  DesktopOsProfile,
  EntityConstruction,
  EntityRuntimeKey,
  Notification,
  NotificationEventBackendAttachOutcome,
  NotificationLifecycleFailure,
  NotificationLifecycleOutcome,
  NotificationRequest,
  NotificationRequestField,
} from '@flighthq/types/contract';

type ElectronNotificationCapabilitiesFor<Profile extends DesktopOsProfile> = Profile extends 'macos'
  ? ElectronMacosNotificationCapabilities
  : ElectronNotificationCapabilities;

export function electronHostNotification<Profile extends DesktopOsProfile>(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions> & { readonly platform: Profile },
): ElectronNotificationCapabilitiesFor<Profile>;

export function electronHostNotification(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions & { platform: 'macos' }>,
): ElectronMacosNotificationCapabilities;
export function electronHostNotification(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions & { platform: 'linux' | 'windows' }>,
): ElectronNotificationCapabilities;
export function electronHostNotification(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronMacosNotificationCapabilities | ElectronNotificationCapabilities;
export function electronHostNotification(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronMacosNotificationCapabilities | ElectronNotificationCapabilities {
  const nativeByNotification = new Map<Notification, ElectronNotification>();
  const actionListeners = new Set<(notification: Readonly<Notification>, actionId: string) => void>();
  const clickListeners = new Set<(notification: Readonly<Notification>) => void>();
  const dismissListeners = new Set<(notification: Readonly<Notification>) => void>();
  const receivedListeners = new Set<(notification: Readonly<Notification>) => void>();
  const replyListeners = new Set<(notification: Readonly<Notification>, actionId: string, text: string) => void>();
  let destroyed = false;
  let destroyCompleted = false;
  let nextId = 1;

  async function closeOne(notification: Notification) {
    const native = nativeByNotification.get(notification);
    if (native === undefined) return { reason: 'already-closed' } as const;
    try {
      native.close();
      nativeByNotification.delete(notification);
      return { reason: 'ok' } as const;
    } catch {
      return { reason: 'operation-failed' } as const;
    }
  }

  async function closeAll(): Promise<NotificationLifecycleOutcome> {
    const failures: NotificationLifecycleFailure[] = [];
    for (const notification of [...nativeByNotification.keys()]) {
      const outcome = await closeOne(notification);
      if (outcome.reason === 'operation-failed') failures.push({ id: notification.id, operation: 'close' });
    }
    return failures.length === 0 ? { reason: 'ok' } : { failures, reason: 'operation-failed' };
  }

  const capabilities: Omit<ElectronNotificationCapabilities, typeof EntityRuntimeKey> = {
    click: electronHostNotificationEventProvider(clickListeners, () => destroyed),
    close: { closeAllNotifications: closeAll },
    delivery: {
      async notify(request) {
        if (destroyed || !electron.Notification.isSupported()) return { reason: 'operation-failed' };
        const invalid = getElectronInvalidNotificationRequestFields(request, options.platform === 'macos');
        if (invalid.length > 0) return { fields: invalid, reason: 'invalid-request' };
        const id = request.id ?? `electron-notification-${nextId++}`;
        const actions = request.actions ?? [];
        let native: ElectronNotification;
        try {
          native = new electron.Notification({
            actions:
              options.platform === 'macos'
                ? actions.map((action) => ({
                    text: action.title,
                    type: 'button',
                  }))
                : undefined,
            body: request.body,
            hasReply: options.platform === 'macos' && replyListeners.size > 0,
            icon: request.icon,
            silent: request.silent,
            title: request.title,
          });
        } catch {
          return { reason: 'operation-failed' };
        }
        return new Promise((resolve) => {
          let settled = false;
          let notification: Notification | null = null;
          const accept = (): Notification => {
            if (notification !== null) return notification;
            notification = createNotificationResource(id, request.title);
            nativeByNotification.set(notification, native);
            bindNotificationClose(notification, () => closeOne(notification!));
            return notification;
          };
          native.on('show', () => {
            const accepted = accept();
            for (const listener of receivedListeners) listener(accepted);
            if (!settled) {
              settled = true;
              resolve({ notification: accepted, reason: 'accepted' });
            }
          });
          native.on('click', () => {
            if (notification === null) return;
            for (const listener of clickListeners) listener(notification);
          });
          native.on('action', (...args) => {
            if (notification === null || options.platform !== 'macos') return;
            const actionId = actions[Number(args[1])]?.id ?? '';
            for (const listener of actionListeners) listener(notification, actionId);
          });
          native.on('reply', (...args) => {
            if (notification === null || options.platform !== 'macos') return;
            const text = String(args[1] ?? '');
            const actionId = actions[0]?.id ?? 'reply';
            for (const listener of replyListeners) listener(notification, actionId, text);
          });
          native.on('close', () => {
            if (notification === null) return;
            nativeByNotification.delete(notification);
            for (const listener of dismissListeners) listener(notification);
          });
          native.on('failed', () => {
            if (!settled) {
              settled = true;
              resolve({ reason: 'operation-failed' });
            }
          });
          try {
            native.show();
          } catch {
            if (!settled) {
              settled = true;
              resolve({ reason: 'operation-failed' });
            }
          }
        });
      },
    },
    dismiss: electronHostNotificationEventProvider(dismissListeners, () => destroyed),
    lifecycle: {
      async destroy() {
        if (destroyCompleted) return { reason: 'already-destroyed' };
        destroyed = true;
        actionListeners.clear();
        clickListeners.clear();
        dismissListeners.clear();
        receivedListeners.clear();
        replyListeners.clear();
        const outcome = await closeAll();
        if (outcome.reason === 'ok') destroyCompleted = true;
        return outcome;
      },
    },
    received: electronHostNotificationEventProvider(receivedListeners, () => destroyed),
  };

  if (options.platform !== 'macos') {
    const out = allocateEntity<ElectronNotificationCapabilities>();
    populateElectronHostNotificationCommon(out, capabilities);
    return finishEntity(out);
  }
  const out = allocateEntity<ElectronMacosNotificationCapabilities>();
  populateElectronHostNotificationMacos(
    out,
    capabilities,
    electronHostNotificationEventProvider(actionListeners, () => destroyed),
    electronHostNotificationEventProvider(replyListeners, () => destroyed),
  );
  return finishEntity(out);
}

export function electronHostNotificationAction(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions & { platform: 'macos' }>,
): ElectronMacosNotificationCapabilities['action'] {
  return electronHostNotification(electron, options).action;
}

export function electronHostNotificationClick(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronNotificationCapabilities['click'] {
  return electronHostNotification(electron, options).click;
}

export function electronHostNotificationClose(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronNotificationCapabilities['close'] {
  return electronHostNotification(electron, options).close;
}

export function electronHostNotificationDelivery(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronNotificationCapabilities['delivery'] {
  return electronHostNotification(electron, options).delivery;
}

export function electronHostNotificationDismiss(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronNotificationCapabilities['dismiss'] {
  return electronHostNotification(electron, options).dismiss;
}

export function electronHostNotificationLifecycle(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronNotificationCapabilities['lifecycle'] {
  return electronHostNotification(electron, options).lifecycle;
}

export function electronHostNotificationReceived(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions>,
): ElectronNotificationCapabilities['received'] {
  return electronHostNotification(electron, options).received;
}

export function electronHostNotificationReply(
  electron: ElectronApi,
  options: Readonly<ElectronHostOptions & { platform: 'macos' }>,
): ElectronMacosNotificationCapabilities['reply'] {
  return electronHostNotification(electron, options).reply;
}

export function populateElectronHostNotificationCommon(
  out: EntityConstruction<ElectronNotificationCapabilities>,
  capabilities: Readonly<Omit<ElectronNotificationCapabilities, typeof EntityRuntimeKey>>,
): void {
  out.click = capabilities.click;
  out.close = capabilities.close;
  out.delivery = capabilities.delivery;
  out.dismiss = capabilities.dismiss;
  out.lifecycle = capabilities.lifecycle;
  out.received = capabilities.received;
}

export function populateElectronHostNotificationMacos(
  out: EntityConstruction<ElectronMacosNotificationCapabilities>,
  capabilities: Readonly<Omit<ElectronNotificationCapabilities, typeof EntityRuntimeKey>>,
  action: ElectronMacosNotificationCapabilities['action'],
  reply: ElectronMacosNotificationCapabilities['reply'],
): void {
  out.action = action;
  out.click = capabilities.click;
  out.close = capabilities.close;
  out.delivery = capabilities.delivery;
  out.dismiss = capabilities.dismiss;
  out.lifecycle = capabilities.lifecycle;
  out.received = capabilities.received;
  out.reply = reply;
}

function electronHostNotificationEventProvider<TListener>(listeners: Set<TListener>, isDestroyed: () => boolean) {
  return {
    async attach(listener: TListener): Promise<NotificationEventBackendAttachOutcome> {
      if (isDestroyed()) return { reason: 'operation-failed', releaseFailed: false };
      listeners.add(listener);
      let released = false;
      return {
        attachment: {
          async release() {
            if (!released) listeners.delete(listener);
            released = true;
            return { reason: 'ok' };
          },
        },
        reason: 'ok',
      };
    },
  };
}

function getElectronInvalidNotificationRequestFields(
  request: Readonly<NotificationRequest>,
  macos: boolean,
): NotificationRequestField[] {
  const allowed = new Set<NotificationRequestField>(['body', 'icon', 'id', 'silent', 'title']);
  if (macos) allowed.add('actions');
  return (Object.keys(request) as NotificationRequestField[]).filter(
    (field) => request[field] !== undefined && !allowed.has(field),
  );
}
