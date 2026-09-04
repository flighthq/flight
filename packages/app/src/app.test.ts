import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { cancelSignal, connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  addAppRecentDocument,
  attachApp,
  attachAppActivate,
  attachAppAllWindowsClosed,
  attachAppOpenFile,
  attachAppQuitRequest,
  attachAppReady,
  attachAppSecondInstance,
  bounceAppDock,
  cancelAppAttention,
  cancelAppDockBounce,
  clearAppRecentDocuments,
  createApp,
  detachApp,
  disposeApp,
  focusApp,
  getAppDirectoryPath,
  getAppExecutablePath,
  getAppLocale,
  getAppLoginItem,
  getAppName,
  getAppPath,
  getAppPreferredSystemLanguages,
  getAppSystemLocale,
  getAppVersion,
  hasAppSingleInstanceLock,
  hideApp,
  isAppHidden,
  quitApp,
  relaunchApp,
  releaseAppSingleInstanceLock,
  requestAppAttention,
  requestAppSingleInstanceLock,
  setAppActivationPolicy,
  setAppBadgeCount,
  setAppDockBadge,
  setAppDockMenu,
  setAppLoginItem,
  setAppName,
  setAppUserModelId,
  showApp,
} from './app';

function createFixture() {
  const calls: string[] = [];
  const listeners = {
    activate: null as null | (() => void),
    allWindowsClosed: null as null | (() => void),
    openFile: null as null | ((path: string) => void),
    quitRequest: null as null | ((cancelHost: () => void) => void),
    ready: null as null | (() => void),
    secondInstance: null as null | ((argv: readonly string[]) => void),
  };
  const unsubscribes = {
    activate: vi.fn(),
    allWindowsClosed: vi.fn(),
    openFile: vi.fn(),
    quitRequest: vi.fn(),
    ready: vi.fn(),
    secondInstance: vi.fn(),
  };
  const subscribe = <Key extends keyof typeof listeners>(key: Key) =>
    (() => {
      const out = allocateEntity<any>();
      out.subscribe = (listener: NonNullable<(typeof listeners)[Key]>) => {
        listeners[key] = listener;
        return unsubscribes[key];
      };
      return finishEntity(out);
    })();
  const host = {
    app: {
      activate: subscribe('activate'),
      activationPolicy: (() => {
        const out = allocateEntity<any>();
        out.setActivationPolicy = (policy: string) => calls.push(`policy:${policy}`);
        return finishEntity(out);
      })(),
      allWindowsClosed: subscribe('allWindowsClosed'),
      badge: (() => {
        const out = allocateEntity<any>();
        out.setBadgeCount = async (count: number) => (calls.push(`badge:${count}`), true);
        return finishEntity(out);
      })(),
      dock: (() => {
        const out = allocateEntity<any>();
        out.bounceDock = () => 17;
        out.cancelAttention = (id: number) => calls.push(`cancelAttention:${id}`);
        out.cancelDockBounce = (id: number) => calls.push(`cancelBounce:${id}`);
        out.requestAttention = (critical: boolean) => (calls.push(`attention:${critical}`), 19);
        out.setDockBadge = (text: string) => calls.push(`dockBadge:${text}`);
        out.setDockMenu = (items: readonly unknown[]) => calls.push(`dockMenu:${items.length}`);
        return finishEntity(out);
      })(),
      focus: (() => {
        const out = allocateEntity<any>();
        out.focus = () => calls.push('focus');
        return finishEntity(out);
      })(),
      hiddenQuery: (() => {
        const out = allocateEntity<any>();
        out.isAppHidden = () => true;
        return finishEntity(out);
      })(),
      hide: (() => {
        const out = allocateEntity<any>();
        out.hideApp = () => calls.push('hide');
        return finishEntity(out);
      })(),
      locale: (() => {
        const out = allocateEntity<any>();
        out.getLocale = () => 'en-GB';
        out.getPreferredSystemLanguages = () => ['en-GB', 'fr'];
        out.getSystemLocale = () => 'en-US';
        return finishEntity(out);
      })(),
      loginItem: (() => {
        const out = allocateEntity<any>();
        out.getLoginItem = () => ({ args: ['--start'], openAsHidden: true, openAtLogin: true, path: '/app' });
        out.setLoginItem = () => calls.push('loginItem');
        return finishEntity(out);
      })(),
      name: (() => {
        const out = allocateEntity<any>();
        out.getName = () => 'Flight';
        return finishEntity(out);
      })(),
      nameWrite: (() => {
        const out = allocateEntity<any>();
        out.setName = (name: string) => calls.push(`name:${name}`);
        return finishEntity(out);
      })(),
      openFile: subscribe('openFile'),
      path: (() => {
        const out = allocateEntity<any>();
        out.getAppDirectoryPath = (kind: string) => `/app/${kind}`;
        out.getAppPath = () => '/app';
        out.getExecutablePath = () => '/app/flight';
        return finishEntity(out);
      })(),
      quit: (() => {
        const out = allocateEntity<any>();
        out.quit = () => calls.push('quit');
        return finishEntity(out);
      })(),
      quitRequest: subscribe('quitRequest'),
      ready: subscribe('ready'),
      recentDocuments: (() => {
        const out = allocateEntity<any>();
        out.addRecentDocument = (path: string) => calls.push(`recent:${path}`);
        out.clearRecentDocuments = () => calls.push('clearRecent');
        return finishEntity(out);
      })(),
      relaunch: (() => {
        const out = allocateEntity<any>();
        out.relaunch = () => calls.push('relaunch');
        return finishEntity(out);
      })(),
      secondInstance: subscribe('secondInstance'),
      show: (() => {
        const out = allocateEntity<any>();
        out.showApp = () => calls.push('show');
        return finishEntity(out);
      })(),
      singleInstance: (() => {
        const out = allocateEntity<any>();
        out.hasSingleInstanceLock = () => true;
        out.releaseSingleInstanceLock = () => calls.push('releaseLock');
        out.requestSingleInstanceLock = () => true;
        return finishEntity(out);
      })(),
      userModelId: (() => {
        const out = allocateEntity<any>();
        out.setUserModelId = (id: string) => calls.push(`userModel:${id}`);
        return finishEntity(out);
      })(),
      version: (() => {
        const out = allocateEntity<any>();
        out.getVersion = () => '1.2.3';
        return finishEntity(out);
      })(),
    },
  };
  return { calls, host, listeners, unsubscribes };
}

describe('addAppRecentDocument', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    addAppRecentDocument(host, '/tmp/a');
    expect(calls).toContain('recent:/tmp/a');
  });
});

describe('attachApp', () => {
  it('attaches all six event providers and replaces a prior attachment', () => {
    const first = createFixture();
    const second = createFixture();
    const app = createApp();
    attachApp(first.host, app);
    attachApp(second.host, app);
    expect(Object.values(first.unsubscribes).every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
  });
});

describe('attachAppActivate', () => {
  it('forwards activation', () => {
    const { host, listeners } = createFixture();
    const app = createApp();
    const receive = vi.fn();
    connectSignal(app.onActivate, receive);
    attachAppActivate(host, app);
    listeners.activate?.();
    expect(receive).toHaveBeenCalledOnce();
  });
});

describe('attachAppAllWindowsClosed', () => {
  it('forwards all-windows-closed', () => {
    const { host, listeners } = createFixture();
    const app = createApp();
    const receive = vi.fn();
    connectSignal(app.onAllWindowsClosed, receive);
    attachAppAllWindowsClosed(host, app);
    listeners.allWindowsClosed?.();
    expect(receive).toHaveBeenCalledOnce();
  });
});

describe('attachAppOpenFile', () => {
  it('forwards the opened path', () => {
    const { host, listeners } = createFixture();
    const app = createApp();
    const receive = vi.fn();
    connectSignal(app.onOpenFile, receive);
    attachAppOpenFile(host, app);
    listeners.openFile?.('/tmp/a.txt');
    expect(receive).toHaveBeenCalledExactlyOnceWith('/tmp/a.txt');
  });
});

describe('attachAppQuitRequest', () => {
  it('translates signal cancellation to the native veto callback', () => {
    const { host, listeners } = createFixture();
    const app = createApp();
    const cancelHost = vi.fn();
    connectSignal(app.onQuitRequest, () => cancelSignal(app.onQuitRequest));
    attachAppQuitRequest(host, app);
    listeners.quitRequest?.(cancelHost);
    expect(cancelHost).toHaveBeenCalledOnce();
  });
});

describe('attachAppReady', () => {
  it('forwards ready', () => {
    const { host, listeners } = createFixture();
    const app = createApp();
    const receive = vi.fn();
    connectSignal(app.onReady, receive);
    attachAppReady(host, app);
    listeners.ready?.();
    expect(receive).toHaveBeenCalledOnce();
  });
});

describe('attachAppSecondInstance', () => {
  it('forwards argv', () => {
    const { host, listeners } = createFixture();
    const app = createApp();
    const receive = vi.fn();
    connectSignal(app.onSecondInstance, receive);
    attachAppSecondInstance(host, app);
    listeners.secondInstance?.(['--open']);
    expect(receive).toHaveBeenCalledExactlyOnceWith(['--open']);
  });
});

describe('bounceAppDock', () => {
  it('returns the provider id', () => expect(bounceAppDock(createFixture().host)).toBe(17));
});

describe('cancelAppAttention', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    cancelAppAttention(host, 3);
    expect(calls).toContain('cancelAttention:3');
  });
});

describe('cancelAppDockBounce', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    cancelAppDockBounce(host, 4);
    expect(calls).toContain('cancelBounce:4');
  });
});
describe('clearAppRecentDocuments', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    clearAppRecentDocuments(host);
    expect(calls).toContain('clearRecent');
  });
});
describe('createApp', () => {
  it('creates an Entity carrying all application signals', () => {
    const app = createApp();
    expect(EntityRuntimeKey in app).toBe(true);
    expect(app).toMatchObject({
      onActivate: expect.any(Object),
      onAllWindowsClosed: expect.any(Object),
      onOpenFile: expect.any(Object),
      onQuitRequest: expect.any(Object),
      onReady: expect.any(Object),
      onSecondInstance: expect.any(Object),
    });
  });
});
describe('detachApp', () => {
  it('unsubscribes every attached provider', () => {
    const { host, unsubscribes } = createFixture();
    const app = createApp();
    attachApp(host, app);
    detachApp(app);
    expect(Object.values(unsubscribes).every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
  });
});
describe('disposeApp', () => {
  it('detaches providers and clears signal listeners', () => {
    const { host, listeners, unsubscribes } = createFixture();
    const app = createApp();
    const receive = vi.fn();
    connectSignal(app.onReady, receive);
    attachApp(host, app);
    disposeApp(app);
    listeners.ready?.();
    expect(unsubscribes.ready).toHaveBeenCalledOnce();
    expect(receive).not.toHaveBeenCalled();
  });
});
describe('focusApp', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    focusApp(host);
    expect(calls).toContain('focus');
  });
});
describe('getAppDirectoryPath', () => {
  it('returns the selected directory', () =>
    expect(getAppDirectoryPath(createFixture().host, 'logs')).toBe('/app/logs'));
});
describe('getAppExecutablePath', () => {
  it('returns the executable path', () => expect(getAppExecutablePath(createFixture().host)).toBe('/app/flight'));
});
describe('getAppLocale', () => {
  it('returns locale', () => expect(getAppLocale(createFixture().host)).toBe('en-GB'));
});
describe('getAppLoginItem', () => {
  it('returns settings', () => expect(getAppLoginItem(createFixture().host).openAtLogin).toBe(true));
});
describe('getAppName', () => {
  it('returns name', () => expect(getAppName(createFixture().host)).toBe('Flight'));
});
describe('getAppPath', () => {
  it('returns app path', () => expect(getAppPath(createFixture().host)).toBe('/app'));
});
describe('getAppPreferredSystemLanguages', () => {
  it('returns languages', () => expect(getAppPreferredSystemLanguages(createFixture().host)).toEqual(['en-GB', 'fr']));
});
describe('getAppSystemLocale', () => {
  it('returns system locale', () => expect(getAppSystemLocale(createFixture().host)).toBe('en-US'));
});
describe('getAppVersion', () => {
  it('returns version', () => expect(getAppVersion(createFixture().host)).toBe('1.2.3'));
});
describe('hasAppSingleInstanceLock', () => {
  it('returns the provider fact', () => expect(hasAppSingleInstanceLock(createFixture().host)).toBe(true));
});
describe('hideApp', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    hideApp(host);
    expect(calls).toContain('hide');
  });
});
describe('isAppHidden', () => {
  it('returns the provider fact', () => expect(isAppHidden(createFixture().host)).toBe(true));
});
describe('quitApp', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    quitApp(host);
    expect(calls).toContain('quit');
  });
});
describe('relaunchApp', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    relaunchApp(host);
    expect(calls).toContain('relaunch');
  });
});
describe('releaseAppSingleInstanceLock', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    releaseAppSingleInstanceLock(host);
    expect(calls).toContain('releaseLock');
  });
});
describe('requestAppAttention', () => {
  it('returns the provider id', () => expect(requestAppAttention(createFixture().host, true)).toBe(19));
});
describe('requestAppSingleInstanceLock', () => {
  it('returns the provider outcome', () => expect(requestAppSingleInstanceLock(createFixture().host)).toBe(true));
});
describe('setAppActivationPolicy', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    setAppActivationPolicy(host, 'accessory');
    expect(calls).toContain('policy:accessory');
  });
});
describe('setAppBadgeCount', () => {
  it('returns the awaited provider outcome', async () => {
    await expect(setAppBadgeCount(createFixture().host, 7)).resolves.toBe(true);
  });
});
describe('setAppDockBadge', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    setAppDockBadge(host, 'x');
    expect(calls).toContain('dockBadge:x');
  });
});
describe('setAppDockMenu', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    setAppDockMenu(host, []);
    expect(calls).toContain('dockMenu:0');
  });
});
describe('setAppLoginItem', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    setAppLoginItem(host, { openAtLogin: true });
    expect(calls).toContain('loginItem');
  });
});
describe('setAppName', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    setAppName(host, 'Renamed');
    expect(calls).toContain('name:Renamed');
  });
});
describe('setAppUserModelId', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    setAppUserModelId(host, 'flight.app');
    expect(calls).toContain('userModel:flight.app');
  });
});
describe('showApp', () => {
  it('delegates', () => {
    const { host, calls } = createFixture();
    showApp(host);
    expect(calls).toContain('show');
  });
});
