import { cancelSignal, connectSignal } from '@flighthq/signals';
import type { AppBackend, AppLoginItem, AppLoginItemLike, MenuItemTemplate } from '@flighthq/types';

import {
  addAppRecentDocument,
  attachApp,
  bounceAppDock,
  cancelAppAttention,
  cancelAppDockBounce,
  clearAppRecentDocuments,
  createApp,
  createAppLoginItem,
  createWebAppBackend,
  detachApp,
  disposeApp,
  focusApp,
  getAppBackend,
  getAppCommandLine,
  getAppCommandLineSwitch,
  getAppDirectoryPath,
  getAppExecutablePath,
  getAppLocale,
  getAppLoginItem,
  getAppName,
  getAppPath,
  getAppPreferredSystemLanguages,
  getAppSystemLocale,
  getAppVersion,
  hasAppCommandLineSwitch,
  hasAppSingleInstanceLock,
  hideApp,
  isAppHidden,
  quitApp,
  relaunchApp,
  releaseAppSingleInstanceLock,
  requestAppAttention,
  requestAppSingleInstanceLock,
  setAppActivationPolicy,
  setAppBackend,
  setAppBadgeCount,
  setAppDockBadge,
  setAppDockMenu,
  setAppLoginItem,
  setAppName,
  setAppUserModelId,
  showApp,
} from './app';

function fakeBackend(): AppBackend & {
  activationPolicy: string;
  badge: string;
  badgeCount: number;
  bounceId: number;
  cancelledAttention: number;
  cancelledBounce: number;
  commandLine: string[];
  dockMenuItems: number;
  focused: boolean;
  hidden: boolean;
  lastRecentDocument: string;
  loginItem: AppLoginItem;
  lock: boolean;
  name: string;
  preferredLanguages: string[];
  recentDocumentsCleared: boolean;
  systemLocale: string;
  userModelId: string;
  fireActivate: () => void;
  fireAllWindowsClosed: () => void;
  fireOpenFile: (path: string) => void;
  fireQuitRequest: (cancel?: () => void) => void;
  fireReady: () => void;
  fireSecondInstance: (argv: readonly string[]) => void;
} {
  let activate: (() => void) | null = null;
  let allWindowsClosed: (() => void) | null = null;
  let openFile: ((path: string) => void) | null = null;
  let quitRequest: ((cancel: () => void) => void) | null = null;
  let ready: (() => void) | null = null;
  let secondInstance: ((argv: readonly string[]) => void) | null = null;
  return {
    activationPolicy: '',
    badge: '',
    badgeCount: -1,
    bounceId: -1,
    cancelledAttention: -1,
    cancelledBounce: -1,
    commandLine: [],
    dockMenuItems: -1,
    focused: false,
    hidden: false,
    lastRecentDocument: '',
    loginItem: { args: [], openAsHidden: false, openAtLogin: false, path: '' },
    lock: false,
    name: 'TestApp',
    preferredLanguages: ['en-US', 'fr-FR'],
    recentDocumentsCleared: false,
    systemLocale: 'en_US',
    userModelId: '',
    addRecentDocument(path) {
      this.lastRecentDocument = path;
    },
    bounceDock() {
      this.bounceId = 7;
      return 7;
    },
    cancelAttention(id) {
      this.cancelledAttention = id;
    },
    cancelDockBounce(id) {
      this.cancelledBounce = id;
    },
    clearRecentDocuments() {
      this.recentDocumentsCleared = true;
    },
    focus() {
      this.focused = true;
    },
    getAppDirectoryPath() {
      return '/test/app/userData';
    },
    getAppPath() {
      return '/test/app';
    },
    getCommandLine() {
      return this.commandLine;
    },
    getExecutablePath() {
      return '/test/app/bin';
    },
    getLocale() {
      return 'en-US';
    },
    getPreferredSystemLanguages() {
      return this.preferredLanguages;
    },
    getSystemLocale() {
      return this.systemLocale;
    },
    getLoginItem() {
      return this.loginItem;
    },
    getName() {
      return this.name;
    },
    getVersion() {
      return '1.2.3';
    },
    hasSingleInstanceLock() {
      return this.lock;
    },
    hideApp() {
      this.hidden = true;
      return true;
    },
    isAppHidden() {
      return this.hidden;
    },
    quit() {},
    relaunch() {},
    releaseSingleInstanceLock() {
      this.lock = false;
    },
    requestAttention() {
      return 42;
    },
    requestSingleInstanceLock() {
      this.lock = true;
      return true;
    },
    setActivationPolicy(policy) {
      this.activationPolicy = policy;
    },
    setBadgeCount(count) {
      this.badgeCount = count;
      return true;
    },
    setDockBadge(text) {
      this.badge = text;
    },
    setDockMenu(items) {
      this.dockMenuItems = items.length;
    },
    setLoginItem(settings) {
      this.loginItem = { ...this.loginItem, ...settings };
      return true;
    },
    setName(n) {
      this.name = n;
      return true;
    },
    setUserModelId(id) {
      this.userModelId = id;
      return true;
    },
    showApp() {
      this.hidden = false;
      return true;
    },
    subscribeActivate(l) {
      activate = l;
      return () => {
        activate = null;
      };
    },
    subscribeAllWindowsClosed(l) {
      allWindowsClosed = l;
      return () => {
        allWindowsClosed = null;
      };
    },
    subscribeOpenFile(l) {
      openFile = l;
      return () => {
        openFile = null;
      };
    },
    subscribeQuitRequest(l) {
      quitRequest = l;
      return () => {
        quitRequest = null;
      };
    },
    subscribeReady(l) {
      ready = l;
      return () => {
        ready = null;
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
    fireAllWindowsClosed() {
      allWindowsClosed?.();
    },
    fireOpenFile(path) {
      openFile?.(path);
    },
    fireQuitRequest(cancel?: () => void) {
      quitRequest?.(cancel ?? (() => {}));
    },
    fireReady() {
      ready?.();
    },
    fireSecondInstance(argv) {
      secondInstance?.(argv);
    },
  };
}

afterEach(() => setAppBackend(null));

describe('addAppRecentDocument', () => {
  it('forwards the path to the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    addAppRecentDocument('/home/user/file.txt');
    expect(backend.lastRecentDocument).toBe('/home/user/file.txt');
  });
});

describe('attachApp', () => {
  it('wires activate, all-windows-closed, open-file, quit-request, ready, and second-instance subscriptions', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    const app = createApp();
    let activations = 0;
    let allWindowsClosedCount = 0;
    let openedPath = '';
    let readyCount = 0;
    let argv: readonly string[] = [];
    connectSignal(app.onActivate, () => activations++);
    connectSignal(app.onAllWindowsClosed, () => allWindowsClosedCount++);
    connectSignal(app.onOpenFile, (path) => (openedPath = path));
    connectSignal(app.onReady, () => readyCount++);
    connectSignal(app.onSecondInstance, (a) => (argv = a));
    attachApp(app);
    backend.fireActivate();
    backend.fireAllWindowsClosed();
    backend.fireOpenFile('/tmp/file.txt');
    backend.fireReady();
    backend.fireSecondInstance(['--flag']);
    expect(activations).toBe(1);
    expect(allWindowsClosedCount).toBe(1);
    expect(openedPath).toBe('/tmp/file.txt');
    expect(readyCount).toBe(1);
    expect(argv).toEqual(['--flag']);
  });

  it('is idempotent — tears down the prior subscription before re-attaching', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    const app = createApp();
    let activations = 0;
    connectSignal(app.onActivate, () => activations++);
    attachApp(app);
    attachApp(app);
    backend.fireActivate();
    expect(activations).toBe(1);
  });

  it('quits when onQuitRequest is not cancelled', () => {
    let quits = 0;
    const backend = fakeBackend();
    backend.quit = () => {
      quits++;
    };
    setAppBackend(backend);
    const app = createApp();
    attachApp(app);
    backend.fireQuitRequest();
    expect(quits).toBe(1);
  });

  it('does not quit when onQuitRequest is cancelled', () => {
    let quits = 0;
    const backend = fakeBackend();
    backend.quit = () => {
      quits++;
    };
    setAppBackend(backend);
    const app = createApp();
    connectSignal(app.onQuitRequest, () => cancelSignal(app.onQuitRequest));
    attachApp(app);
    backend.fireQuitRequest();
    expect(quits).toBe(0);
  });

  it('calls the host cancel callback when onQuitRequest is vetoed', () => {
    let hostCancelled = false;
    const backend = fakeBackend();
    setAppBackend(backend);
    const app = createApp();
    connectSignal(app.onQuitRequest, () => cancelSignal(app.onQuitRequest));
    attachApp(app);
    backend.fireQuitRequest(() => {
      hostCancelled = true;
    });
    expect(hostCancelled).toBe(true);
  });
});

describe('bounceAppDock', () => {
  it('returns the backend bounce id', () => {
    setAppBackend(fakeBackend());
    expect(bounceAppDock()).toBe(7);
  });
});

describe('cancelAppAttention', () => {
  it('forwards the id to the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    cancelAppAttention(42);
    expect(backend.cancelledAttention).toBe(42);
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

describe('clearAppRecentDocuments', () => {
  it('clears via the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    clearAppRecentDocuments();
    expect(backend.recentDocumentsCleared).toBe(true);
  });
});

describe('createApp', () => {
  it('creates an entity with six signals', () => {
    const app = createApp();
    expect(app.onActivate).toBeDefined();
    expect(app.onAllWindowsClosed).toBeDefined();
    expect(app.onOpenFile).toBeDefined();
    expect(app.onQuitRequest).toBeDefined();
    expect(app.onReady).toBeDefined();
    expect(app.onSecondInstance).toBeDefined();
  });
});

describe('createAppLoginItem', () => {
  it('returns a default login item', () => {
    const item = createAppLoginItem();
    expect(item.openAtLogin).toBe(false);
    expect(item.openAsHidden).toBe(false);
    expect(item.args).toEqual([]);
    expect(item.path).toBe('');
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

  it('returns sentinel values for unavailable APIs', () => {
    const backend = createWebAppBackend();
    expect(backend.getAppPath()).toBe('');
    expect(backend.getExecutablePath()).toBe('');
    expect(backend.getCommandLine()).toEqual([]);
    expect(backend.getLoginItem().openAtLogin).toBe(false);
    expect(backend.hideApp()).toBe(false);
    expect(backend.isAppHidden()).toBe(false);
    expect(backend.requestAttention(false)).toBe(-1);
    expect(backend.setLoginItem({})).toBe(false);
    expect(backend.setName('X')).toBe(false);
    expect(backend.setUserModelId('X')).toBe(false);
    expect(backend.showApp()).toBe(false);
  });

  it('returns preferred system languages and system locale', () => {
    const backend = createWebAppBackend();
    expect(Array.isArray(backend.getPreferredSystemLanguages())).toBe(true);
    expect(typeof backend.getSystemLocale()).toBe('string');
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

  it('is safe to call when not attached', () => {
    expect(() => detachApp(createApp())).not.toThrow();
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

describe('getAppCommandLine', () => {
  it('returns the command line from the backend', () => {
    const backend = fakeBackend();
    backend.commandLine = ['--flag', '--key=val'];
    setAppBackend(backend);
    expect(getAppCommandLine()).toEqual(['--flag', '--key=val']);
  });
});

describe('getAppCommandLineSwitch', () => {
  it('returns empty string for a bare flag', () => {
    const backend = fakeBackend();
    backend.commandLine = ['--debug'];
    setAppBackend(backend);
    expect(getAppCommandLineSwitch('debug')).toBe('');
  });

  it('returns the value for a key=value switch', () => {
    const backend = fakeBackend();
    backend.commandLine = ['--port=3000'];
    setAppBackend(backend);
    expect(getAppCommandLineSwitch('port')).toBe('3000');
  });

  it('returns null when the switch is absent', () => {
    setAppBackend(fakeBackend());
    expect(getAppCommandLineSwitch('missing')).toBeNull();
  });
});

describe('getAppDirectoryPath', () => {
  it('returns the path from the backend', () => {
    setAppBackend(fakeBackend());
    expect(getAppDirectoryPath('userData')).toBe('/test/app/userData');
  });
});

describe('getAppExecutablePath', () => {
  it('returns the executable path from the backend', () => {
    setAppBackend(fakeBackend());
    expect(getAppExecutablePath()).toBe('/test/app/bin');
  });
});

describe('getAppLocale', () => {
  it('reads the backend locale', () => {
    setAppBackend(fakeBackend());
    expect(getAppLocale()).toBe('en-US');
  });
});

describe('getAppLoginItem', () => {
  it('returns the login item from the backend', () => {
    const backend = fakeBackend();
    backend.loginItem = { args: ['--hidden'], openAsHidden: true, openAtLogin: true, path: '/app' };
    setAppBackend(backend);
    const item = getAppLoginItem();
    expect(item.openAtLogin).toBe(true);
    expect(item.openAsHidden).toBe(true);
  });
});

describe('getAppName', () => {
  it('reads the backend name', () => {
    setAppBackend(fakeBackend());
    expect(getAppName()).toBe('TestApp');
  });
});

describe('getAppPath', () => {
  it('returns the app path from the backend', () => {
    setAppBackend(fakeBackend());
    expect(getAppPath()).toBe('/test/app');
  });
});

describe('getAppPreferredSystemLanguages', () => {
  it('returns the preferred system languages from the backend', () => {
    setAppBackend(fakeBackend());
    expect(getAppPreferredSystemLanguages()).toEqual(['en-US', 'fr-FR']);
  });
});

describe('getAppSystemLocale', () => {
  it('returns the system locale from the backend', () => {
    setAppBackend(fakeBackend());
    expect(getAppSystemLocale()).toBe('en_US');
  });
});

describe('getAppVersion', () => {
  it('reads the backend version', () => {
    setAppBackend(fakeBackend());
    expect(getAppVersion()).toBe('1.2.3');
  });
});

describe('hasAppCommandLineSwitch', () => {
  it('returns true when the switch is present', () => {
    const backend = fakeBackend();
    backend.commandLine = ['--debug'];
    setAppBackend(backend);
    expect(hasAppCommandLineSwitch('debug')).toBe(true);
  });

  it('returns false when the switch is absent', () => {
    setAppBackend(fakeBackend());
    expect(hasAppCommandLineSwitch('missing')).toBe(false);
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

describe('hideApp', () => {
  it('hides the app and returns true from the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    expect(hideApp()).toBe(true);
    expect(backend.hidden).toBe(true);
  });
});

describe('isAppHidden', () => {
  it('reflects the backend hidden state', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    expect(isAppHidden()).toBe(false);
    hideApp();
    expect(isAppHidden()).toBe(true);
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

describe('requestAppAttention', () => {
  it('returns the attention id from the backend', () => {
    setAppBackend(fakeBackend());
    expect(requestAppAttention(true)).toBe(42);
  });
});

describe('requestAppSingleInstanceLock', () => {
  it('acquires the lock', () => {
    setAppBackend(fakeBackend());
    expect(requestAppSingleInstanceLock()).toBe(true);
  });
});

describe('setAppActivationPolicy', () => {
  it('forwards the policy to the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    setAppActivationPolicy('accessory');
    expect(backend.activationPolicy).toBe('accessory');
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

describe('setAppLoginItem', () => {
  it('updates the login item and returns true when supported', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    const settings: Readonly<AppLoginItemLike> = { openAtLogin: true, openAsHidden: false };
    expect(setAppLoginItem(settings)).toBe(true);
    expect(backend.loginItem.openAtLogin).toBe(true);
  });

  it('returns false on the web backend', () => {
    expect(setAppLoginItem({ openAtLogin: true })).toBe(false);
  });
});

describe('setAppName', () => {
  it('updates the name via the backend and returns true', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    expect(setAppName('MyApp')).toBe(true);
    expect(backend.name).toBe('MyApp');
  });

  it('returns false on the web backend', () => {
    expect(setAppName('X')).toBe(false);
  });
});

describe('setAppUserModelId', () => {
  it('forwards the ID to the backend and returns true', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    expect(setAppUserModelId('com.example.app')).toBe(true);
    expect(backend.userModelId).toBe('com.example.app');
  });

  it('returns false on the web backend', () => {
    expect(setAppUserModelId('X')).toBe(false);
  });
});

describe('showApp', () => {
  it('shows the app and returns true from the backend', () => {
    const backend = fakeBackend();
    setAppBackend(backend);
    hideApp();
    expect(showApp()).toBe(true);
    expect(backend.hidden).toBe(false);
  });
});
