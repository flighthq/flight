import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostNotificationCapabilities,
  NotificationCloseBackend,
  NotificationSchedulingBackend,
  NotificationUpdateBackend,
} from '@flighthq/types/contract';

import {
  cancelScheduledNotification,
  closeAllNotifications,
  closeNotification,
  createServiceWorkerNotificationCapabilities,
  createWebNotificationCapabilities,
  getActiveNotifications,
  getNotificationPermission,
  getPendingNotifications,
  notifyServiceWorkerNotificationEvent,
  onNotificationAction,
  onNotificationClick,
  onNotificationDismiss,
  onNotificationReply,
  onNotificationShow,
  requestNotificationPermission,
  scheduleNotification,
  showNotification,
  updateNotification,
} from './notification';

interface FakeWebNotificationRecord {
  instance: FakeWebNotification;
  options?: NotificationOptions;
  title: string;
}

class FakeWebNotification {
  static permission: NotificationPermission = 'granted';
  static records: FakeWebNotificationRecord[] = [];
  static async requestPermission(): Promise<NotificationPermission> {
    return FakeWebNotification.permission;
  }

  onclick: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onshow: ((event: Event) => void) | null = null;

  constructor(title: string, options?: NotificationOptions) {
    FakeWebNotification.records.push({ instance: this, options, title });
  }

  close(): void {
    this.onclose?.(new Event('close'));
  }
}

const originalNotification = globalThis.Notification;

beforeEach(() => {
  FakeWebNotification.permission = 'granted';
  FakeWebNotification.records = [];
  globalThis.Notification = FakeWebNotification as unknown as typeof Notification;
});

afterAll(() => {
  globalThis.Notification = originalNotification;
});

function fakeRegistration() {
  type Entry = {
    data?: unknown;
    options?: NotificationOptions;
    tag: string;
    title: string;
  };
  const shown: Entry[] = [];
  return {
    add(entry: Entry) {
      shown.push(entry);
    },
    async getNotifications(filter?: { tag?: string }) {
      return shown
        .filter((entry) => filter?.tag === undefined || entry.tag === filter.tag)
        .map((entry) => ({
          data: entry.data ?? entry.options?.data,
          tag: entry.tag,
          title: entry.title,
          close() {
            const index = shown.indexOf(entry);
            if (index !== -1) shown.splice(index, 1);
          },
        }));
    },
    shown,
    async showNotification(title: string, options?: NotificationOptions) {
      shown.push({ data: options?.data, options, tag: String(options?.tag ?? ''), title });
    },
  };
}

describe('basic web notification capabilities', () => {
  it('declares only its honest slots', () => {
    const capabilities = createWebNotificationCapabilities();
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual([
      'click',
      'close',
      'delivery',
      'dismiss',
      'scheduling',
      'show',
      'update',
    ]);
  });

  it('shows, updates by merging, and closes one stable id', async () => {
    const capabilities = createWebNotificationCapabilities();
    expect(await capabilities.delivery.notify({ body: 'old', icon: 'icon.png', id: 'n1', title: 'Title' })).toBe('n1');
    expect(await capabilities.update.updateNotification('n1', { body: 'new' })).toBe(true);
    expect(FakeWebNotification.records[1]).toMatchObject({
      options: { body: 'new', icon: 'icon.png', tag: 'n1' },
      title: 'Title',
    });
    await capabilities.close.closeNotification('n1');
    expect(await capabilities.update.updateNotification('n1', { body: 'again' })).toBe(false);
  });

  it('returns null rather than a support-probe sentinel when runtime delivery is unavailable', async () => {
    FakeWebNotification.permission = 'denied';
    const capabilities = createWebNotificationCapabilities();
    expect(await capabilities.delivery.getPermission()).toBe('denied');
    expect(await capabilities.delivery.notify({ title: 'No' })).toBeNull();
  });
});

describe('cancelScheduledNotification', () => {
  it('pins cancellation to the scheduling provider that created the handle', async () => {
    const aCancelled: string[] = [];
    const bCancelled: string[] = [];
    const scheduling = (cancelled: string[]): NotificationSchedulingBackend => ({
      async cancelScheduledNotification(id) {
        cancelled.push(id);
      },
      async getPendingNotifications() {
        return [];
      },
      async scheduleNotification() {
        return 'same-id';
      },
    });
    const scheduled = await scheduleNotification(
      host({ scheduling: scheduling(aCancelled) }),
      { title: 'A' },
      { at: 1 },
    );
    await cancelScheduledNotification(host({ scheduling: scheduling(bCancelled) }), scheduled!);
    await cancelScheduledNotification(host({ scheduling: scheduling(bCancelled) }), scheduled!);
    expect(aCancelled).toEqual(['same-id']);
    expect(bCancelled).toEqual([]);
  });
});

function delivery(id: string) {
  return {
    async getPermission() {
      return 'granted' as const;
    },
    async notify() {
      return id;
    },
    async requestPermission() {
      return 'granted' as const;
    },
  };
}

function host<const TCapabilities extends HostNotificationCapabilities>(notification: TCapabilities) {
  return { notification };
}

describe('closeAllNotifications', () => {
  it('routes to the passed close provider', async () => {
    let closeAllCalls = 0;
    await closeAllNotifications(
      host({
        close: {
          async closeAllNotifications() {
            closeAllCalls += 1;
          },
          async closeNotification() {},
        },
      }),
    );
    expect(closeAllCalls).toBe(1);
  });
});

describe('closeNotification', () => {
  it('pins close to the delivery provider and closes only once', async () => {
    const aClosed: string[] = [];
    const bClosed: string[] = [];
    const closeA: NotificationCloseBackend = {
      async closeAllNotifications() {},
      async closeNotification(id) {
        aClosed.push(id);
      },
    };
    const closeB: NotificationCloseBackend = {
      async closeAllNotifications() {},
      async closeNotification(id) {
        bClosed.push(id);
      },
    };
    const created = await showNotification(host({ close: closeA, delivery: delivery('same-id') }), { title: 'A' });
    await closeNotification(host({ close: closeB }), created!);
    await closeNotification(host({ close: closeB }), created!);
    expect(aClosed).toEqual(['same-id']);
    expect(bClosed).toEqual([]);
  });
});

describe('createServiceWorkerNotificationCapabilities', () => {
  it('creates the honest service-worker capability shape', () => {
    expect(Object.keys(createServiceWorkerNotificationCapabilities(fakeRegistration())).sort()).toEqual([
      'action',
      'activeList',
      'click',
      'close',
      'delivery',
      'dismiss',
      'reply',
      'scheduling',
      'show',
    ]);
  });
});

describe('createWebNotificationCapabilities', () => {
  it('creates the honest basic-web capability shape', () => {
    expect(Object.keys(createWebNotificationCapabilities()).sort()).toEqual([
      'click',
      'close',
      'delivery',
      'dismiss',
      'scheduling',
      'show',
      'update',
    ]);
  });
});

describe('explicit notification operations', () => {
  it('reads and requests permission from the passed delivery slot', async () => {
    const value = host({ delivery: delivery('n1') });
    expect(await getNotificationPermission(value)).toBe('granted');
    expect(await requestNotificationPermission(value)).toBe('granted');
  });

  it('pins close to the provider that created the displayed handle', async () => {
    const aClosed: string[] = [];
    const bClosed: string[] = [];
    const closeA: NotificationCloseBackend = {
      async closeAllNotifications() {},
      async closeNotification(id) {
        aClosed.push(id);
      },
    };
    const closeB: NotificationCloseBackend = {
      async closeAllNotifications() {},
      async closeNotification(id) {
        bClosed.push(id);
      },
    };
    const created = await showNotification(host({ close: closeA, delivery: delivery('same-id') }), { title: 'A' });
    expect(created).not.toBeNull();
    await closeNotification(host({ close: closeB }), created!);
    await closeNotification(host({ close: closeB }), created!);
    expect(aClosed).toEqual(['same-id']);
    expect(bClosed).toEqual([]);
  });

  it('pins update to the provider that created the displayed handle', async () => {
    const aUpdated: string[] = [];
    const bUpdated: string[] = [];
    const updateA: NotificationUpdateBackend = {
      async updateNotification(id) {
        aUpdated.push(id);
        return true;
      },
    };
    const updateB: NotificationUpdateBackend = {
      async updateNotification(id) {
        bUpdated.push(id);
        return true;
      },
    };
    const created = await showNotification(host({ delivery: delivery('same-id'), update: updateA }), { title: 'A' });
    expect(await updateNotification(host({ update: updateB }), created!, { body: 'changed' })).toBe(true);
    expect(aUpdated).toEqual(['same-id']);
    expect(bUpdated).toEqual([]);
  });

  it('pins cancellation to the provider that created the schedule handle', async () => {
    const aCancelled: string[] = [];
    const bCancelled: string[] = [];
    const scheduling = (cancelled: string[]): NotificationSchedulingBackend => ({
      async cancelScheduledNotification(id) {
        cancelled.push(id);
      },
      async getPendingNotifications() {
        return [];
      },
      async scheduleNotification() {
        return 'same-id';
      },
    });
    const scheduled = await scheduleNotification(
      host({ scheduling: scheduling(aCancelled) }),
      { title: 'A' },
      { at: 1 },
    );
    await cancelScheduledNotification(host({ scheduling: scheduling(bCancelled) }), scheduled!);
    await cancelScheduledNotification(host({ scheduling: scheduling(bCancelled) }), scheduled!);
    expect(aCancelled).toEqual(['same-id']);
    expect(bCancelled).toEqual([]);
  });

  it('pins pending-list handles to the provider that enumerated them', async () => {
    const cancelled: string[] = [];
    const owner: NotificationSchedulingBackend = {
      async cancelScheduledNotification(id) {
        cancelled.push(id);
      },
      async getPendingNotifications() {
        return [{ id: 'listed', request: { title: 'Later' }, schedule: { at: 1 } }];
      },
      async scheduleNotification() {
        return null;
      },
    };
    const fallback: NotificationSchedulingBackend = {
      async cancelScheduledNotification() {
        throw new Error('wrong provider');
      },
      async getPendingNotifications() {
        return [];
      },
      async scheduleNotification() {
        return null;
      },
    };
    const [pending] = await getPendingNotifications(host({ scheduling: owner }));
    await cancelScheduledNotification(host({ scheduling: fallback }), pending!);
    expect(cancelled).toEqual(['listed']);
  });

  it('pins active-list handles to the provider that enumerated them', async () => {
    const closed: string[] = [];
    const ownerClose: NotificationCloseBackend = {
      async closeAllNotifications() {},
      async closeNotification(id) {
        closed.push(id);
      },
    };
    const owner = host({
      activeList: {
        async getActiveNotifications() {
          return [{ id: 'active', tag: 'tag', title: 'Title' }];
        },
      },
      close: ownerClose,
    });
    const [active] = await getActiveNotifications(owner);
    await closeNotification(
      host({
        close: {
          async closeAllNotifications() {},
          async closeNotification() {
            throw new Error('wrong provider');
          },
        },
      }),
      active!,
    );
    expect(closed).toEqual(['active']);
  });

  it('returns an origin-pinned, idempotent event unsubscribe', () => {
    const listeners = new Set<(id: string) => void>();
    const value = host({
      click: {
        subscribe(listener) {
          listeners.add(listener);
        },
        unsubscribe(listener) {
          listeners.delete(listener);
        },
      },
    });
    const seen: string[] = [];
    const unsubscribe = onNotificationClick(value, (id) => seen.push(id));
    for (const listener of listeners) listener('before');
    unsubscribe();
    unsubscribe();
    for (const listener of listeners) listener('after');
    expect(seen).toEqual(['before']);
  });
});

describe('getActiveNotifications', () => {
  it('pins returned handles to the listing provider', async () => {
    const closed: string[] = [];
    const owner = host({
      activeList: {
        async getActiveNotifications() {
          return [{ id: 'active', tag: 'tag', title: 'Title' }];
        },
      },
      close: {
        async closeAllNotifications() {},
        async closeNotification(id: string) {
          closed.push(id);
        },
      },
    });
    const [active] = await getActiveNotifications(owner);
    await closeNotification(
      host({
        close: {
          async closeAllNotifications() {},
          async closeNotification() {
            throw new Error('wrong provider');
          },
        },
      }),
      active!,
    );
    expect(closed).toEqual(['active']);
  });
});

describe('getNotificationPermission', () => {
  it('reads permission from the passed delivery provider', async () => {
    expect(await getNotificationPermission(host({ delivery: delivery('n1') }))).toBe('granted');
  });
});

describe('getPendingNotifications', () => {
  it('pins returned handles to the enumerating scheduling provider', async () => {
    const cancelled: string[] = [];
    const owner: NotificationSchedulingBackend = {
      async cancelScheduledNotification(id) {
        cancelled.push(id);
      },
      async getPendingNotifications() {
        return [{ id: 'listed', request: { title: 'Later' }, schedule: { at: 1 } }];
      },
      async scheduleNotification() {
        return null;
      },
    };
    const [pending] = await getPendingNotifications(host({ scheduling: owner }));
    await cancelScheduledNotification(
      host({
        scheduling: {
          async cancelScheduledNotification() {
            throw new Error('wrong provider');
          },
          async getPendingNotifications() {
            return [];
          },
          async scheduleNotification() {
            return null;
          },
        },
      }),
      pending!,
    );
    expect(cancelled).toEqual(['listed']);
  });
});

describe('notifyServiceWorkerNotificationEvent', () => {
  it('routes a worker click to the matching capability object', () => {
    const capabilities = createServiceWorkerNotificationCapabilities(fakeRegistration());
    const seen: string[] = [];
    capabilities.click.subscribe((id) => seen.push(id));
    notifyServiceWorkerNotificationEvent(capabilities, { notificationId: 'n1', type: 'notificationclick' });
    expect(seen).toEqual(['n1']);
  });
});

describe('onNotificationAction', () => {
  it('subscribes and idempotently unsubscribes an action listener', () => {
    const listeners = new Set<(id: string, actionId: string) => void>();
    const seen: string[] = [];
    const unsubscribe = onNotificationAction(
      host({
        action: {
          subscribe(listener) {
            listeners.add(listener);
          },
          unsubscribe(listener) {
            listeners.delete(listener);
          },
        },
      }),
      (id, actionId) => seen.push(`${id}:${actionId}`),
    );
    for (const listener of listeners) listener('n1', 'open');
    unsubscribe();
    unsubscribe();
    for (const listener of listeners) listener('n2', 'ignored');
    expect(seen).toEqual(['n1:open']);
  });
});

describe('onNotificationClick', () => {
  it('subscribes and idempotently unsubscribes a click listener', () => {
    const listeners = new Set<(id: string) => void>();
    const seen: string[] = [];
    const unsubscribe = onNotificationClick(
      host({
        click: {
          subscribe(listener) {
            listeners.add(listener);
          },
          unsubscribe(listener) {
            listeners.delete(listener);
          },
        },
      }),
      (id) => seen.push(id),
    );
    for (const listener of listeners) listener('n1');
    unsubscribe();
    unsubscribe();
    for (const listener of listeners) listener('ignored');
    expect(seen).toEqual(['n1']);
  });
});

describe('onNotificationDismiss', () => {
  it('subscribes and idempotently unsubscribes a dismiss listener', () => {
    const listeners = new Set<(id: string) => void>();
    const seen: string[] = [];
    const unsubscribe = onNotificationDismiss(
      host({
        dismiss: {
          subscribe(listener) {
            listeners.add(listener);
          },
          unsubscribe(listener) {
            listeners.delete(listener);
          },
        },
      }),
      (id) => seen.push(id),
    );
    for (const listener of listeners) listener('n1');
    unsubscribe();
    unsubscribe();
    for (const listener of listeners) listener('ignored');
    expect(seen).toEqual(['n1']);
  });
});

describe('onNotificationReply', () => {
  it('subscribes and idempotently unsubscribes a reply listener', () => {
    const listeners = new Set<(id: string, actionId: string, text: string) => void>();
    const seen: string[] = [];
    const unsubscribe = onNotificationReply(
      host({
        reply: {
          subscribe(listener) {
            listeners.add(listener);
          },
          unsubscribe(listener) {
            listeners.delete(listener);
          },
        },
      }),
      (id, actionId, text) => seen.push(`${id}:${actionId}:${text}`),
    );
    for (const listener of listeners) listener('n1', 'reply', 'hello');
    unsubscribe();
    unsubscribe();
    for (const listener of listeners) listener('ignored', 'reply', 'ignored');
    expect(seen).toEqual(['n1:reply:hello']);
  });
});

describe('onNotificationShow', () => {
  it('subscribes and idempotently unsubscribes a show listener', () => {
    const listeners = new Set<(id: string) => void>();
    const seen: string[] = [];
    const unsubscribe = onNotificationShow(
      host({
        show: {
          subscribe(listener) {
            listeners.add(listener);
          },
          unsubscribe(listener) {
            listeners.delete(listener);
          },
        },
      }),
      (id) => seen.push(id),
    );
    for (const listener of listeners) listener('n1');
    unsubscribe();
    unsubscribe();
    for (const listener of listeners) listener('ignored');
    expect(seen).toEqual(['n1']);
  });
});

describe('requestNotificationPermission', () => {
  it('requests permission from the passed delivery provider', async () => {
    expect(await requestNotificationPermission(host({ delivery: delivery('n1') }))).toBe('granted');
  });
});

describe('scheduleNotification', () => {
  it('returns a handle for the id from the passed scheduling provider', async () => {
    const handle = await scheduleNotification(
      host({
        scheduling: {
          async cancelScheduledNotification() {},
          async getPendingNotifications() {
            return [];
          },
          async scheduleNotification(request, schedule) {
            expect(request.title).toBe('Later');
            expect(schedule.at).toBe(1);
            return 'scheduled';
          },
        },
      }),
      { title: 'Later' },
      { at: 1 },
    );
    expect(handle).toEqual({ id: 'scheduled' });
  });
});

describe('service-worker notification capabilities', () => {
  it('declares every honest slot while excluding update', () => {
    const capabilities = createServiceWorkerNotificationCapabilities(fakeRegistration());
    expect(EntityRuntimeKey in capabilities).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual([
      'action',
      'activeList',
      'click',
      'close',
      'delivery',
      'dismiss',
      'reply',
      'scheduling',
      'show',
    ]);
    expect('update' in capabilities).toBe(false);
  });

  it('lists only Flight notifications with a stable id and truthful summary fields', async () => {
    const registration = fakeRegistration();
    const capabilities = createServiceWorkerNotificationCapabilities(registration);
    await capabilities.delivery.notify({ body: 'details', id: 'flight-id', tag: 'display-tag', title: 'Flight' });
    registration.add({ data: { unrelated: true }, tag: 'foreign', title: 'Other code' });
    expect(await capabilities.activeList.getActiveNotifications()).toEqual([
      { id: 'flight-id', tag: 'display-tag', title: 'Flight' },
    ]);
  });

  it('closes by Flight id even when the platform tag differs', async () => {
    const registration = fakeRegistration();
    const capabilities = createServiceWorkerNotificationCapabilities(registration);
    await capabilities.delivery.notify({ id: 'flight-id', tag: 'different-tag', title: 'Flight' });
    await capabilities.close.closeNotification('flight-id');
    expect(registration.shown).toEqual([]);
  });

  it('delivers each declared event and honors its unsubscribe pair', async () => {
    const capabilities = createServiceWorkerNotificationCapabilities(fakeRegistration());
    const seen: string[] = [];
    const show = (id: string): void => {
      seen.push(`show:${id}`);
    };
    const click = (id: string): void => {
      seen.push(`click:${id}`);
    };
    const action = (id: string, actionId: string): void => {
      seen.push(`action:${id}:${actionId}`);
    };
    const dismiss = (id: string): void => {
      seen.push(`dismiss:${id}`);
    };
    const reply = (id: string, actionId: string, text: string): void => {
      seen.push(`reply:${id}:${actionId}:${text}`);
    };
    capabilities.show.subscribe(show);
    capabilities.click.subscribe(click);
    capabilities.action.subscribe(action);
    capabilities.dismiss.subscribe(dismiss);
    capabilities.reply.subscribe(reply);
    await capabilities.delivery.notify({ id: 'n1', title: 'Flight' });
    notifyServiceWorkerNotificationEvent(capabilities, {
      actionId: 'open',
      notificationId: 'n1',
      type: 'notificationclick',
    });
    notifyServiceWorkerNotificationEvent(capabilities, {
      actionId: 'reply',
      notificationId: 'n1',
      reply: 'hello',
      type: 'notificationclick',
    });
    notifyServiceWorkerNotificationEvent(capabilities, { notificationId: 'n1', type: 'notificationclose' });
    expect(seen).toEqual(['show:n1', 'action:n1:open', 'click:n1', 'reply:n1:reply:hello', 'dismiss:n1']);
    capabilities.show.unsubscribe(show);
    capabilities.click.unsubscribe(click);
    capabilities.action.unsubscribe(action);
    capabilities.dismiss.unsubscribe(dismiss);
    capabilities.reply.unsubscribe(reply);
    notifyServiceWorkerNotificationEvent(capabilities, { notificationId: 'n1', type: 'notificationclose' });
    expect(seen).toHaveLength(5);
  });

  it('pairs schedule with pending introspection and cancellation', async () => {
    const capabilities = createServiceWorkerNotificationCapabilities(fakeRegistration());
    const id = await capabilities.scheduling.scheduleNotification(
      { id: 'scheduled', title: 'Later' },
      { at: Date.now() + 60_000 },
    );
    expect(id).toBe('scheduled');
    expect(await capabilities.scheduling.getPendingNotifications()).toHaveLength(1);
    await capabilities.scheduling.cancelScheduledNotification('scheduled');
    expect(await capabilities.scheduling.getPendingNotifications()).toEqual([]);
  });
});

describe('showNotification', () => {
  it('returns a handle for the id from the passed delivery provider', async () => {
    expect(await showNotification(host({ delivery: delivery('shown') }), { title: 'Title' })).toEqual({
      id: 'shown',
    });
  });
});

describe('updateNotification', () => {
  it('pins updates to the provider that created the displayed handle', async () => {
    const aUpdated: string[] = [];
    const bUpdated: string[] = [];
    const updateA: NotificationUpdateBackend = {
      async updateNotification(id) {
        aUpdated.push(id);
        return true;
      },
    };
    const updateB: NotificationUpdateBackend = {
      async updateNotification(id) {
        bUpdated.push(id);
        return true;
      },
    };
    const created = await showNotification(host({ delivery: delivery('same-id'), update: updateA }), { title: 'A' });
    expect(await updateNotification(host({ update: updateB }), created!, { body: 'changed' })).toBe(true);
    expect(aUpdated).toEqual(['same-id']);
    expect(bUpdated).toEqual([]);
  });
});
