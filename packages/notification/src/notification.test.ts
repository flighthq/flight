import type {
  NotificationBackend,
  NotificationCapabilities,
  NotificationChannel,
  NotificationPermission,
  NotificationRequest,
  NotificationSchedule,
  ScheduledNotification,
} from '@flighthq/types';

import {
  cancelScheduledNotification,
  closeAllNotifications,
  closeNotification,
  createNotificationChannel,
  createServiceWorkerNotificationBackend,
  createWebNotificationBackend,
  deleteNotificationChannel,
  getActiveNotifications,
  getLaunchNotification,
  getNotificationBackend,
  getNotificationCapabilities,
  getNotificationChannels,
  getNotificationPermission,
  getPendingNotifications,
  isNotificationSupported,
  notifyServiceWorkerBackendAction,
  onNotificationAction,
  onNotificationClick,
  onNotificationDismiss,
  onNotificationReply,
  onNotificationShow,
  requestNotificationPermission,
  scheduleNotification,
  setNotificationBackend,
  showNotification,
  updateNotification,
} from './notification';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEB_CAPABILITIES: NotificationCapabilities = {
  actions: false,
  channels: false,
  coldStart: false,
  image: false,
  listActive: false,
  scheduling: true,
  textReply: false,
};

function fakeBackend(): NotificationBackend & {
  closedIds: string[];
  lastTitle: string | null;
  pendingList: ScheduledNotification[];
  fireAction(id: string, actionId: string): void;
  fireClick(id: string): void;
  fireDismiss(id: string): void;
  fireReply(id: string, actionId: string, text: string): void;
  fireShow(id: string): void;
  updatedId: string | null;
  updatedPartial: Partial<NotificationRequest> | null;
} {
  let clickListener: ((id: string) => void) | null = null;
  let actionListener: ((id: string, actionId: string) => void) | null = null;
  let dismissListener: ((id: string) => void) | null = null;
  let replyListener: ((id: string, actionId: string, text: string) => void) | null = null;
  let showListener: ((id: string) => void) | null = null;
  return {
    closedIds: [],
    lastTitle: null,
    pendingList: [],
    updatedId: null,
    updatedPartial: null,
    cancelScheduledNotification(_id) {},
    closeAllNotifications() {
      this.closedIds.push('*');
    },
    closeNotification(id) {
      this.closedIds.push(id);
    },
    getCapabilities() {
      return { ...WEB_CAPABILITIES };
    },
    async getLaunchNotification() {
      return null;
    },
    async getActiveNotifications() {
      return [];
    },
    async getPendingNotifications() {
      return this.pendingList;
    },
    getPermission() {
      return 'granted';
    },
    isSupported() {
      return true;
    },
    async notify(request) {
      this.lastTitle = request.title;
      return request.id ?? 'generated-id';
    },
    async requestPermission(): Promise<NotificationPermission> {
      return 'granted';
    },
    async scheduleNotification(request, _schedule) {
      return request.id ?? 'sched-id';
    },
    subscribeAction(listener) {
      actionListener = listener;
      return () => {
        actionListener = null;
      };
    },
    subscribeClick(listener) {
      clickListener = listener;
      return () => {
        clickListener = null;
      };
    },
    subscribeDismiss(listener) {
      dismissListener = listener;
      return () => {
        dismissListener = null;
      };
    },
    subscribeReply(listener) {
      replyListener = listener;
      return () => {
        replyListener = null;
      };
    },
    subscribeShow(listener) {
      showListener = listener;
      return () => {
        showListener = null;
      };
    },
    async updateNotification(id, partial) {
      this.updatedId = id;
      this.updatedPartial = partial;
      return true;
    },
    fireAction(id, actionId) {
      actionListener?.(id, actionId);
    },
    fireClick(id) {
      clickListener?.(id);
    },
    fireDismiss(id) {
      dismissListener?.(id);
    },
    fireReply(id, actionId, text) {
      replyListener?.(id, actionId, text);
    },
    fireShow(id) {
      showListener?.(id);
    },
  };
}

afterEach(() => setNotificationBackend(null));

// ---------------------------------------------------------------------------
// cancelScheduledNotification
// ---------------------------------------------------------------------------

describe('cancelScheduledNotification', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    let cancelledId: string | null = null;
    backend.cancelScheduledNotification = (id) => {
      cancelledId = id;
    };
    setNotificationBackend(backend);
    cancelScheduledNotification('sched-1');
    expect(cancelledId).toBe('sched-1');
  });
});

// ---------------------------------------------------------------------------
// closeAllNotifications
// ---------------------------------------------------------------------------

describe('closeAllNotifications', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    closeAllNotifications();
    expect(backend.closedIds).toContain('*');
  });
});

// ---------------------------------------------------------------------------
// closeNotification
// ---------------------------------------------------------------------------

describe('closeNotification', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    closeNotification('msg-1');
    expect(backend.closedIds).toEqual(['msg-1']);
  });
});

// ---------------------------------------------------------------------------
// createNotificationChannel
// ---------------------------------------------------------------------------

describe('createNotificationChannel', () => {
  it('calls createNotificationChannel on backends that support it', () => {
    const backend = fakeBackend() as ReturnType<typeof fakeBackend> & {
      createNotificationChannel?: (c: Readonly<NotificationChannel>) => void;
      receivedChannel?: NotificationChannel;
    };
    backend.createNotificationChannel = (c) => {
      backend.receivedChannel = c as NotificationChannel;
    };
    setNotificationBackend(backend);
    const channel: NotificationChannel = { id: 'updates', name: 'Updates' };
    createNotificationChannel(channel);
    expect(backend.receivedChannel).toEqual(channel);
  });

  it('no-ops on backends without the method', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    expect(() => createNotificationChannel({ id: 'x', name: 'X' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createWebNotificationBackend
// ---------------------------------------------------------------------------

describe('createServiceWorkerNotificationBackend', () => {
  function fakeRegistration() {
    const shown: Array<{ title: string; options?: NotificationOptions }> = [];
    return {
      shown,
      async showNotification(title: string, options?: NotificationOptions) {
        shown.push({ title, options });
      },
      async getNotifications(_filter?: { tag?: string }) {
        return shown.map((n) => ({
          title: n.title,
          tag: (n.options?.tag as string) ?? '',
          close() {
            const idx = shown.indexOf(n);
            if (idx !== -1) shown.splice(idx, 1);
          },
        }));
      },
    };
  }

  it('returns a backend object satisfying the NotificationBackend interface', () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    expect(typeof backend.notify).toBe('function');
    expect(typeof backend.requestPermission).toBe('function');
    expect(typeof backend.isSupported).toBe('function');
    expect(typeof backend.subscribeAction).toBe('function');
    expect(typeof backend.subscribeClick).toBe('function');
    expect(typeof backend.subscribeDismiss).toBe('function');
    expect(typeof backend.subscribeShow).toBe('function');
    expect(typeof backend.updateNotification).toBe('function');
  });

  it('getCapabilities reports actions: true', () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    const caps = backend.getCapabilities();
    expect(caps.actions).toBe(true);
    expect(caps.scheduling).toBe(true);
    expect(caps.listActive).toBe(true);
  });

  it('getPermission returns a valid tri-state value', () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    const perm = backend.getPermission();
    expect(['default', 'granted', 'denied']).toContain(perm);
  });

  it('getLaunchNotification returns null', async () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    expect(await backend.getLaunchNotification()).toBeNull();
  });

  it('scheduleNotification returns a non-empty id and getPendingNotifications lists it', async () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    const schedule: NotificationSchedule = { at: Date.now() + 60_000 };
    const id = await backend.scheduleNotification({ title: 'SW Reminder' }, schedule);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    const pending = await backend.getPendingNotifications();
    expect(pending.length).toBe(1);
    expect(pending[0]!.id).toBe(id);
    backend.cancelScheduledNotification(id);
  });

  it('cancelScheduledNotification removes from pending list', async () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    const schedule: NotificationSchedule = { at: Date.now() + 60_000 };
    const id = await backend.scheduleNotification({ title: 'SW Soon' }, schedule);
    backend.cancelScheduledNotification(id);
    const pending = await backend.getPendingNotifications();
    expect(pending.find((p) => p.id === id)).toBeUndefined();
  });

  it('subscribeAction unsubscribe stops delivery', () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    let count = 0;
    const unsub = backend.subscribeAction(() => {
      count += 1;
    });
    unsub();
    expect(count).toBe(0);
  });

  it('requestPermission returns a valid NotificationPermission', async () => {
    const reg = fakeRegistration();
    const backend = createServiceWorkerNotificationBackend(reg);
    const perm = await backend.requestPermission();
    expect(['default', 'granted', 'denied']).toContain(perm);
  });
});

// ---------------------------------------------------------------------------
// deleteNotificationChannel
// ---------------------------------------------------------------------------

describe('createWebNotificationBackend', () => {
  it('returns sentinels without throwing in jsdom', async () => {
    const backend = createWebNotificationBackend();
    expect(typeof backend.isSupported()).toBe('boolean');
    // requestPermission now returns NotificationPermission (tri-state string), not boolean.
    expect(['default', 'granted', 'denied']).toContain(await backend.requestPermission());
    expect(typeof (await backend.notify({ title: 'hi' }))).toBe('string');
    expect(typeof backend.subscribeClick(() => {})).toBe('function');
    expect(typeof backend.subscribeAction(() => {})).toBe('function');
    expect(typeof backend.subscribeDismiss(() => {})).toBe('function');
    expect(typeof backend.subscribeReply(() => {})).toBe('function');
    expect(typeof backend.subscribeShow(() => {})).toBe('function');
    expect(() => backend.closeNotification('x')).not.toThrow();
    expect(() => backend.closeAllNotifications()).not.toThrow();
  });

  it('getPermission returns a valid tri-state value in jsdom', () => {
    const backend = createWebNotificationBackend();
    const perm = backend.getPermission();
    expect(['default', 'granted', 'denied']).toContain(perm);
  });

  it('getCapabilities matches the expected web shape', () => {
    const backend = createWebNotificationBackend();
    expect(backend.getCapabilities()).toEqual(WEB_CAPABILITIES);
  });

  it('getLaunchNotification returns null on web', async () => {
    const backend = createWebNotificationBackend();
    expect(await backend.getLaunchNotification()).toBeNull();
  });

  it('getActiveNotifications returns an empty array on web', async () => {
    const backend = createWebNotificationBackend();
    expect(await backend.getActiveNotifications()).toEqual([]);
  });

  it('scheduleNotification returns a non-empty id and getPendingNotifications lists it', async () => {
    const backend = createWebNotificationBackend();
    const schedule: NotificationSchedule = { at: Date.now() + 60_000 };
    const id = await backend.scheduleNotification({ title: 'Reminder' }, schedule);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    const pending = await backend.getPendingNotifications();
    expect(pending.length).toBe(1);
    expect(pending[0]!.id).toBe(id);
    backend.cancelScheduledNotification(id);
  });

  it('cancelScheduledNotification removes from pending list', async () => {
    const backend = createWebNotificationBackend();
    const schedule: NotificationSchedule = { at: Date.now() + 60_000 };
    const id = await backend.scheduleNotification({ title: 'Soon' }, schedule);
    backend.cancelScheduledNotification(id);
    const pending = await backend.getPendingNotifications();
    expect(pending.find((p) => p.id === id)).toBeUndefined();
  });

  it('subscribeClick unsubscribe stops delivery', () => {
    const backend = createWebNotificationBackend();
    let count = 0;
    const unsub = backend.subscribeClick(() => {
      count += 1;
    });
    unsub();
    // No way to trigger a click in jsdom but we at least verify unsubscribe does not throw.
    expect(count).toBe(0);
  });

  it('subscribeAction unsubscribe is callable without throwing', () => {
    const backend = createWebNotificationBackend();
    const unsub = backend.subscribeAction(() => {});
    expect(() => unsub()).not.toThrow();
  });

  it('subscribeReply unsubscribe is callable without throwing', () => {
    const backend = createWebNotificationBackend();
    const unsub = backend.subscribeReply(() => {});
    expect(() => unsub()).not.toThrow();
  });

  it('subscribeShow unsubscribe is callable without throwing', () => {
    const backend = createWebNotificationBackend();
    const unsub = backend.subscribeShow(() => {});
    expect(() => unsub()).not.toThrow();
  });

  it('subscribeDismiss unsubscribe is callable without throwing', () => {
    const backend = createWebNotificationBackend();
    const unsub = backend.subscribeDismiss(() => {});
    expect(() => unsub()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getActiveNotifications
// ---------------------------------------------------------------------------

describe('deleteNotificationChannel', () => {
  it('calls deleteNotificationChannel on backends that support it', () => {
    const backend = fakeBackend() as ReturnType<typeof fakeBackend> & {
      deleteNotificationChannel?: (id: string) => void;
      deletedChannelId?: string;
    };
    backend.deleteNotificationChannel = (id) => {
      backend.deletedChannelId = id;
    };
    setNotificationBackend(backend);
    deleteNotificationChannel('updates');
    expect(backend.deletedChannelId).toBe('updates');
  });

  it('no-ops on backends without the method', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    expect(() => deleteNotificationChannel('x')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getLaunchNotification
// ---------------------------------------------------------------------------

describe('getActiveNotifications', () => {
  it('delegates to the active backend', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const result = await getActiveNotifications();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getNotificationBackend
// ---------------------------------------------------------------------------

describe('getLaunchNotification', () => {
  it('delegates to the active backend', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const result = await getLaunchNotification();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getNotificationCapabilities
// ---------------------------------------------------------------------------

describe('getNotificationBackend', () => {
  it('falls back to a web backend', () => {
    expect(getNotificationBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    expect(getNotificationBackend()).toBe(backend);
  });
});

// ---------------------------------------------------------------------------
// getNotificationChannels
// ---------------------------------------------------------------------------

describe('getNotificationCapabilities', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const caps = getNotificationCapabilities();
    expect(typeof caps.actions).toBe('boolean');
    expect(typeof caps.channels).toBe('boolean');
    expect(typeof caps.scheduling).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// getNotificationPermission
// ---------------------------------------------------------------------------

describe('getNotificationChannels', () => {
  it('returns an empty array on backends without channel support', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    expect(getNotificationChannels()).toEqual([]);
  });

  it('calls getNotificationChannels on backends that support it', () => {
    const channel: NotificationChannel = { id: 'ch1', name: 'Ch 1' };
    const backend = fakeBackend() as ReturnType<typeof fakeBackend> & {
      getNotificationChannels?: () => ReadonlyArray<Readonly<NotificationChannel>>;
    };
    backend.getNotificationChannels = () => [channel];
    setNotificationBackend(backend);
    expect(getNotificationChannels()).toEqual([channel]);
  });
});

// ---------------------------------------------------------------------------
// getPendingNotifications
// ---------------------------------------------------------------------------

describe('getNotificationPermission', () => {
  it('delegates to the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    expect(getNotificationPermission()).toBe('granted');
  });

  it('returns a valid tri-state from the web backend', () => {
    const perm = getNotificationPermission();
    expect(['default', 'granted', 'denied']).toContain(perm);
  });
});

// ---------------------------------------------------------------------------
// isNotificationSupported
// ---------------------------------------------------------------------------

describe('getPendingNotifications', () => {
  it('delegates to the active backend', async () => {
    const req: NotificationRequest = { title: 'sched', id: 'sn-1' };
    const schedule: NotificationSchedule = { at: Date.now() + 10_000 };
    const backend = fakeBackend();
    backend.pendingList = [{ id: 'sn-1', request: req, schedule }];
    setNotificationBackend(backend);
    const list = await getPendingNotifications();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe('sn-1');
  });
});

// ---------------------------------------------------------------------------
// onNotificationAction
// ---------------------------------------------------------------------------

describe('isNotificationSupported', () => {
  it('delegates to the active backend', () => {
    setNotificationBackend(fakeBackend());
    expect(isNotificationSupported()).toBe(true);
  });

  it('returns a boolean from the web backend', () => {
    expect(typeof isNotificationSupported()).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// onNotificationClick
// ---------------------------------------------------------------------------

describe('notifyServiceWorkerBackendAction', () => {
  function fakeSwRegistration() {
    return {
      async showNotification(_title: string, _options?: NotificationOptions) {},
      async getNotifications(_filter?: { tag?: string }) {
        return [];
      },
    };
  }

  it('delivers action events to subscribeAction listeners', () => {
    const backend = createServiceWorkerNotificationBackend(fakeSwRegistration());
    let received: [string, string] | null = null;
    backend.subscribeAction((id, actionId) => {
      received = [id, actionId];
    });
    notifyServiceWorkerBackendAction(backend, {
      type: 'notificationclick',
      notificationId: 'n1',
      actionId: 'reply',
    });
    expect(received).toEqual(['n1', 'reply']);
  });

  it('delivers click events to subscribeClick listeners when no actionId', () => {
    const backend = createServiceWorkerNotificationBackend(fakeSwRegistration());
    let received: string | null = null;
    backend.subscribeClick((id) => {
      received = id;
    });
    notifyServiceWorkerBackendAction(backend, {
      type: 'notificationclick',
      notificationId: 'n2',
    });
    expect(received).toBe('n2');
  });

  it('no-ops for non-notificationclick message types', () => {
    const backend = createServiceWorkerNotificationBackend(fakeSwRegistration());
    let called = false;
    backend.subscribeClick(() => {
      called = true;
    });
    notifyServiceWorkerBackendAction(backend, {
      type: 'push',
      notificationId: 'n3',
    });
    expect(called).toBe(false);
  });

  it('no-ops gracefully on a non-SW backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    expect(() =>
      notifyServiceWorkerBackendAction(backend, { type: 'notificationclick', notificationId: 'x' }),
    ).not.toThrow();
    setNotificationBackend(null);
  });
});

// ---------------------------------------------------------------------------
// onNotificationDismiss
// ---------------------------------------------------------------------------

describe('onNotificationAction', () => {
  it('delivers id and action id via the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let receivedId: string | null = null;
    let receivedAction: string | null = null;
    onNotificationAction((id, actionId) => {
      receivedId = id;
      receivedAction = actionId;
    });
    backend.fireAction('chat', 'reply');
    expect(receivedId).toBe('chat');
    expect(receivedAction).toBe('reply');
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let count = 0;
    const unsubscribe = onNotificationAction(() => {
      count += 1;
    });
    backend.fireAction('a', 'x');
    unsubscribe();
    backend.fireAction('a', 'x');
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// onNotificationReply
// ---------------------------------------------------------------------------

describe('onNotificationClick', () => {
  it('delivers the notification id via the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let received: string | null = null;
    onNotificationClick((id) => {
      received = id;
    });
    backend.fireClick('chat');
    expect(received).toBe('chat');
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let count = 0;
    const unsubscribe = onNotificationClick(() => {
      count += 1;
    });
    backend.fireClick('a');
    unsubscribe();
    backend.fireClick('a');
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// onNotificationShow
// ---------------------------------------------------------------------------

describe('onNotificationDismiss', () => {
  it('delivers the notification id via the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let received: string | null = null;
    onNotificationDismiss((id) => {
      received = id;
    });
    backend.fireDismiss('notif-42');
    expect(received).toBe('notif-42');
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let count = 0;
    const unsubscribe = onNotificationDismiss(() => {
      count += 1;
    });
    backend.fireDismiss('a');
    unsubscribe();
    backend.fireDismiss('a');
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// requestNotificationPermission
// ---------------------------------------------------------------------------

describe('onNotificationReply', () => {
  it('delivers id, actionId, and reply text via the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let received: [string, string, string] | null = null;
    onNotificationReply((id, actionId, text) => {
      received = [id, actionId, text];
    });
    backend.fireReply('chat', 'reply', 'Hello back!');
    expect(received).toEqual(['chat', 'reply', 'Hello back!']);
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let count = 0;
    const unsubscribe = onNotificationReply(() => {
      count += 1;
    });
    backend.fireReply('a', 'r', 'x');
    unsubscribe();
    backend.fireReply('a', 'r', 'x');
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// scheduleNotification
// ---------------------------------------------------------------------------

describe('onNotificationShow', () => {
  it('delivers the notification id via the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let received: string | null = null;
    onNotificationShow((id) => {
      received = id;
    });
    backend.fireShow('notif-1');
    expect(received).toBe('notif-1');
  });

  it('returns an unsubscribe that stops delivery', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let count = 0;
    const unsubscribe = onNotificationShow(() => {
      count += 1;
    });
    backend.fireShow('a');
    unsubscribe();
    backend.fireShow('a');
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// setNotificationBackend
// ---------------------------------------------------------------------------

describe('requestNotificationPermission', () => {
  it('delegates to the active backend and returns a tri-state NotificationPermission', async () => {
    setNotificationBackend(fakeBackend());
    const result = await requestNotificationPermission();
    expect(['default', 'granted', 'denied']).toContain(result);
    expect(result).toBe('granted');
  });

  it('returns a valid tri-state from the web backend in jsdom', async () => {
    const result = await requestNotificationPermission();
    expect(['default', 'granted', 'denied']).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// showNotification
// ---------------------------------------------------------------------------

describe('scheduleNotification', () => {
  it('echoes the supplied id', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const schedule: NotificationSchedule = { at: Date.now() + 5_000 };
    const id = await scheduleNotification({ title: 'Future', id: 'my-id' }, schedule);
    expect(id).toBe('my-id');
  });

  it('returns a generated id when request has no id', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const schedule: NotificationSchedule = { at: Date.now() + 5_000 };
    const id = await scheduleNotification({ title: 'Future' }, schedule);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createServiceWorkerNotificationBackend
// ---------------------------------------------------------------------------

describe('setNotificationBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setNotificationBackend(fakeBackend());
    setNotificationBackend(null);
    expect(getNotificationBackend()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// notifyServiceWorkerBackendAction
// ---------------------------------------------------------------------------

describe('showNotification', () => {
  it('delegates to the active backend and returns a string id', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const id = await showNotification({ title: 'Hello', body: 'there' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(backend.lastTitle).toBe('Hello');
  });

  it('echoes the caller-supplied id', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const id = await showNotification({ title: 'X', id: 'my-stable-id' });
    expect(id).toBe('my-stable-id');
  });

  it('returns a string from the web backend without throwing in jsdom', async () => {
    expect(typeof (await showNotification({ title: 'Hello' }))).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// updateNotification
// ---------------------------------------------------------------------------

describe('updateNotification', () => {
  it('delegates to the active backend', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    const result = await updateNotification('notif-1', { body: 'Updated body' });
    expect(typeof result).toBe('boolean');
    expect(backend.updatedId).toBe('notif-1');
    expect(backend.updatedPartial).toEqual({ body: 'Updated body' });
  });

  it('returns false when the notification is not live on the web backend', async () => {
    const result = await updateNotification('nonexistent-id', { body: 'New body' });
    expect(result).toBe(false);
  });

  it('web backend updateNotification no-ops on title-less partial without live entry', async () => {
    const { createWebNotificationBackend: create } = await import('./notification');
    const backend = create();
    const result = await backend.updateNotification('missing', { body: 'x' });
    expect(result).toBe(false);
  });
});
