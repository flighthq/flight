import { connectSignal } from '@flighthq/signals';
import type { AppBackend, MenuItemTemplate } from '@flighthq/types';

import {
  attachApp,
  bounceAppDock,
  cancelAppDockBounce,
  createApp,
  createWebAppBackend,
  detachApp,
  disposeApp,
  focusApp,
  getAppBackend,
  getAppLocale,
  getAppName,
  getAppVersion,
  hasAppSingleInstanceLock,
  quitApp,
  relaunchApp,
  releaseAppSingleInstanceLock,
  requestAppSingleInstanceLock,
  setAppBackend,
  setAppBadgeCount,
  setAppDockBadge,
  setAppDockMenu,
} from './app';

function fakeBackend(): AppBackend & {
  badge: string;
  badgeCount: number;
  dockMenuItems: number;
  bounceId: number;
  cancelledBounce: number;
  focused: boolean;
  lock: boolean;
  quit: () => void;
  fireActivate: () => void;
  fireOpenFile: (path: string) => void;
  fireSecondInstance: (argv: readonly string[]) => void;
} {
  let activate: (() => void) | null = null;
  let openFile: ((path: string) => void) | null = null;
  let secondInstance: ((argv: readonly string[]) => void) | null = null;
  let quitCalls = 0;
  return {
    badge: '',
    badgeCount: -1,
    dockMenuItems: -1,
    bounceId: -1,
    cancelledBounce: -1,
    focused: false,
    lock: false,
    getName() {
      return 'TestApp';
    },
    getVersion() {
      return '1.2.3';
    },
    getLocale() {
      return 'en-US';
    },
    quit() {
      quitCalls++;
    },
    relaunch() {
      // no-op for the fake
    },
    focus() {
      this.focused = true;
    },
    requestSingleInstanceLock() {
      this.lock = true;
      return true;
    },
    releaseSingleInstanceLock() {
      this.lock = false;
    },
    hasSingleInstanceLock() {
      return this.lock;
    },
    setDockBadge(text) {
      this.badge = text;
    },
    setBadgeCount(count) {
      this.badgeCount = count;
      return true;
    },
    setDockMenu(items) {
      this.dockMenuItems = items.length;
    },
    bounceDock() {
      this.bounceId = 7;
      return 7;
    },
    cancelDockBounce(id) {
      this.cancelledBounce = id;
    },
    subscribeActivate(l) {
      activate = l;
      return () => {
        activate = null;
      };
    },
    subscribeOpenFile(l) {
      openFile = l;
      return () => {
        openFile = null;
      };
    },
    subscribeSecondInstance(l) {
      secondInstance = l;
      return () => {
        secondInstance = null;
      };
    },
    fireActivate() {
      activate?.();
    },
    fireOpenFile(path) {
      openFile?.(path);
    },
    fireSecondInstance(argv) {
      secondInstance?.(argv);
    },
  };
}

afterEach(() => setAppBackend(null));

describe('attachApp', () => {
  it('wires activate, open-file, and second-instance subscriptions to the signals', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    const app = createApp();
    let activations = 0;
    let openedPath = '';
    let argv: readonly string[] = [];
    connectSignal(app.onActivate, () => activations++);
    connectSignal(app.onOpenFile, (path) => (openedPath = path));
    connectSignal(app.onSecondInstance, (a) => (argv = a));
    attachApp(app);
    backend.fireActivate();
    backend.fireOpenFile('/tmp/file.txt');
    backend.fireSecondInstance(['--flag']);
    expect(activations).toBe(1);
    expect(openedPath).toBe('/tmp/file.txt');
    expect(argv).toEqual(['--flag']);
  });
});

describe('bounceAppDock', () => {
  it('returns the backend bounce id', () => {
    setAppBackend(fakeBackend());
    expect(bounceAppDock()).toBe(7);
  });
});

describe('cancelAppDockBounce', () => {
  it('forwards the id to the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    cancelAppDockBounce(7);
    expect(backend.cancelledBounce).toBe(7);
  });
});

describe('createApp', () => {
  it('creates an entity with three signals', () => {
    const app = createApp();
    expect(app.onActivate).toBeDefined();
    expect(app.onOpenFile).toBeDefined();
    expect(app.onSecondInstance).toBeDefined();
  });
});

describe('createWebAppBackend', () => {
  it('reads identity values without throwing', () => {
    const backend = createWebAppBackend();
    expect(typeof backend.getName()).toBe('string');
    expect(typeof backend.getVersion()).toBe('string');
    expect(typeof backend.getLocale()).toBe('string');
    expect(backend.requestSingleInstanceLock()).toBe(true);
    expect(backend.hasSingleInstanceLock()).toBe(true);
    expect(backend.bounceDock()).toBe(-1);
    expect(backend.subscribeActivate(() => {})).toBeInstanceOf(Function);
  });
});

describe('detachApp', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    const app = createApp();
    let activations = 0;
    connectSignal(app.onActivate, () => activations++);
    attachApp(app);
    detachApp(app);
    backend.fireActivate();
    expect(activations).toBe(0);
  });
});

describe('disposeApp', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    const app = createApp();
    attachApp(app);
    expect(() => disposeApp(app)).not.toThrow();
  });
});

describe('focusApp', () => {
  it('focuses through the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    focusApp();
    expect(backend.focused).toBe(true);
  });
});

describe('getAppBackend', () => {
  it('falls back to a web backend', () => {
    expect(getAppBackend()).not.toBeNull();
  });
});

describe('getAppLocale', () => {
  it('reads the backend locale', () => {
    setAppBackend(fakeBackend());
    expect(getAppLocale()).toBe('en-US');
  });
});

describe('getAppName', () => {
  it('reads the backend name', () => {
    setAppBackend(fakeBackend());
    expect(getAppName()).toBe('TestApp');
  });
});

describe('getAppVersion', () => {
  it('reads the backend version', () => {
    setAppBackend(fakeBackend());
    expect(getAppVersion()).toBe('1.2.3');
  });
});

describe('hasAppSingleInstanceLock', () => {
  it('reflects the backend lock state', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    expect(hasAppSingleInstanceLock()).toBe(false);
    requestAppSingleInstanceLock();
    expect(hasAppSingleInstanceLock()).toBe(true);
  });
});

describe('quitApp', () => {
  it('quits without throwing', () => {
    setAppBackend(fakeBackend());
    expect(() => quitApp()).not.toThrow();
  });
});

describe('relaunchApp', () => {
  it('relaunches without throwing', () => {
    setAppBackend(fakeBackend());
    expect(() => relaunchApp()).not.toThrow();
  });
});

describe('releaseAppSingleInstanceLock', () => {
  it('releases the lock', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    requestAppSingleInstanceLock();
    releaseAppSingleInstanceLock();
    expect(backend.lock).toBe(false);
  });
});

describe('requestAppSingleInstanceLock', () => {
  it('acquires the lock', () => {
    setAppBackend(fakeBackend());
    expect(requestAppSingleInstanceLock()).toBe(true);
  });
});

describe('setAppBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setAppBackend(fakeBackend());
    setAppBackend(null);
    expect(getAppBackend()).not.toBeNull();
  });
});

describe('setAppBadgeCount', () => {
  it('forwards the count to the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    expect(setAppBadgeCount(5)).toBe(true);
    expect(backend.badgeCount).toBe(5);
  });

  it('returns a boolean from the web backend without throwing', () => {
    expect(typeof setAppBadgeCount(2)).toBe('boolean');
  });
});

describe('setAppDockBadge', () => {
  it('forwards the badge text to the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    setAppDockBadge('3');
    expect(backend.badge).toBe('3');
  });
});

describe('setAppDockMenu', () => {
  it('forwards the menu items to the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    const items: readonly MenuItemTemplate[] = [{ id: 'new', label: 'New' }];
    setAppDockMenu(items);
    expect(backend.dockMenuItems).toBe(1);
  });
});
