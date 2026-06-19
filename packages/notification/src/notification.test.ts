import type { NotificationBackend } from '@flighthq/types';

import {
  createWebNotificationBackend,
  getNotificationBackend,
  isNotificationSupported,
  onNotificationAction,
  onNotificationClick,
  requestNotificationPermission,
  setNotificationBackend,
  showNotification,
} from './notification';

function fakeBackend(): NotificationBackend & {
  lastTitle: string | null;
  fireClick(tag: string): void;
  fireAction(tag: string, actionId: string): void;
} {
  let clickListener: ((tag: string) => void) | null = null;
  let actionListener: ((tag: string, actionId: string) => void) | null = null;
  return {
    lastTitle: null,
    isSupported() {
      return true;
    },
    async requestPermission() {
      return true;
    },
    async notify(request) {
      this.lastTitle = request.title;
      return true;
    },
    subscribeClick(listener) {
      clickListener = listener;
      return () => {
        clickListener = null;
      };
    },
    subscribeAction(listener) {
      actionListener = listener;
      return () => {
        actionListener = null;
      };
    },
    fireClick(tag) {
      clickListener?.(tag);
    },
    fireAction(tag, actionId) {
      actionListener?.(tag, actionId);
    },
  };
}

afterEach(() => setNotificationBackend(null));

describe('createWebNotificationBackend', () => {
  it('returns sentinels without throwing in jsdom', async () => {
    const backend = createWebNotificationBackend();
    expect(typeof backend.isSupported()).toBe('boolean');
    expect(typeof (await backend.requestPermission())).toBe('boolean');
    expect(typeof (await backend.notify({ title: 'hi' }))).toBe('boolean');
    expect(typeof backend.subscribeClick(() => {})).toBe('function');
    expect(typeof backend.subscribeAction(() => {})).toBe('function');
  });
});

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

describe('isNotificationSupported', () => {
  it('delegates to the active backend', () => {
    setNotificationBackend(fakeBackend());
    expect(isNotificationSupported()).toBe(true);
  });

  it('returns a boolean from the web backend', () => {
    expect(typeof isNotificationSupported()).toBe('boolean');
  });
});

describe('onNotificationAction', () => {
  it('delivers tag and action id via the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let receivedTag: string | null = null;
    let receivedAction: string | null = null;
    onNotificationAction((tag, actionId) => {
      receivedTag = tag;
      receivedAction = actionId;
    });
    backend.fireAction('chat', 'reply');
    expect(receivedTag).toBe('chat');
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

describe('onNotificationClick', () => {
  it('delivers the notification tag via the active backend', () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    let received: string | null = null;
    onNotificationClick((tag) => {
      received = tag;
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

describe('requestNotificationPermission', () => {
  it('delegates to the active backend', async () => {
    setNotificationBackend(fakeBackend());
    expect(await requestNotificationPermission()).toBe(true);
  });
});

describe('setNotificationBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setNotificationBackend(fakeBackend());
    setNotificationBackend(null);
    expect(getNotificationBackend()).not.toBeNull();
  });
});

describe('showNotification', () => {
  it('delegates to the active backend', async () => {
    const backend = fakeBackend();
    setNotificationBackend(backend);
    expect(await showNotification({ title: 'Hello', body: 'there' })).toBe(true);
    expect(backend.lastTitle).toBe('Hello');
  });

  it('returns false from the web backend without throwing in jsdom', async () => {
    expect(typeof (await showNotification({ title: 'Hello' }))).toBe('boolean');
  });
});
