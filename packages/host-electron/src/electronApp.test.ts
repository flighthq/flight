import type { ElectronApi, ElectronMenu, ElectronMenuItemOptions } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  createElectronAppCapabilities,
  initializeAppActivateBackend,
  initializeAppActivationPolicyBackend,
  initializeAppAllWindowsClosedBackend,
  initializeAppBadgeBackend,
  initializeAppDockBackend,
  initializeAppFocusBackend,
  initializeAppHideBackend,
  initializeAppLocaleBackend,
  initializeAppLoginItemBackend,
  initializeAppNameBackend,
  initializeAppNameWriteBackend,
  initializeAppOpenFileBackend,
  initializeAppPathBackend,
  initializeAppQuitBackend,
  initializeAppQuitRequestBackend,
  initializeAppReadyBackend,
  initializeAppRecentDocumentsBackend,
  initializeAppRelaunchBackend,
  initializeAppSecondInstanceBackend,
  initializeAppShowBackend,
  initializeAppSingleInstanceBackend,
  initializeAppUserModelIdBackend,
  initializeAppVersionBackend,
  initializeAppVisibilityQueryBackend,
  initializeElectronCommonAppCapabilities,
  initializeElectronLinuxAppCapabilities,
  initializeElectronMacosAppCapabilities,
  initializeElectronWindowsAppCapabilities,
} from './electronApp';

function fakeElectron() {
  const calls: string[] = [];
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const box = { dockMenuTemplate: null as ElectronMenuItemOptions[] | null };
  const electron = {
    app: {
      addRecentDocument: (path: string) => calls.push(`recent:${path}`),
      clearRecentDocuments: () => calls.push('clearRecent'),
      dock: {
        bounce: (kind?: string) => (calls.push(`bounce:${kind ?? ''}`), 7),
        cancelBounce: (id: number) => calls.push(`cancelBounce:${id}`),
        setBadge: (text: string) => calls.push(`dockBadge:${text}`),
        setMenu: () => calls.push('dockMenu'),
      },
      focus: () => calls.push('focus'),
      getAppPath: () => '/app',
      getLocale: () => 'en-US',
      getLoginItemSettings: () => ({ openAsHidden: false, openAtLogin: true }),
      getName: () => 'Flight',
      getPath: (kind: string) => `/path/${kind}`,
      getPreferredSystemLanguages: () => ['en-US', 'fr'],
      getSystemLocale: () => 'en-GB',
      getVersion: () => '1.2.3',
      hasSingleInstanceLock: () => true,
      hide: () => calls.push('hide'),
      isHidden: () => true,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      quit: () => calls.push('quit'),
      relaunch: () => calls.push('relaunch'),
      releaseSingleInstanceLock: () => calls.push('releaseLock'),
      removeListener: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
        );
      },
      requestSingleInstanceLock: () => true,
      setActivationPolicy: (policy: string) => calls.push(`policy:${policy}`),
      setAppUserModelId: (id: string) => calls.push(`userModel:${id}`),
      setBadgeCount: (count: number) => (calls.push(`badge:${count}`), true),
      setLoginItemSettings: () => calls.push('loginItem'),
      setName: (name: string) => calls.push(`name:${name}`),
      show: () => calls.push('show'),
    },
    Menu: {
      buildFromTemplate: (template: ElectronMenuItemOptions[]): ElectronMenu => {
        box.dockMenuTemplate = template;
        return {} as ElectronMenu;
      },
    },
  } as unknown as ElectronApi;
  return {
    calls,
    electron,
    listeners,
    get dockMenuTemplate() {
      return box.dockMenuTemplate;
    },
  };
}

describe('createElectronAppCapabilities', () => {
  it('publishes common application identity, control, and event slots on every profile', async () => {
    const fake = fakeElectron();
    const app = createElectronAppCapabilities(fake.electron, 'linux');
    expect(EntityRuntimeKey in app).toBe(true);
    expect(Object.keys(app).sort()).toEqual([
      'allWindowsClosed',
      'badge',
      'focus',
      'locale',
      'name',
      'nameWrite',
      'path',
      'quit',
      'quitRequest',
      'ready',
      'relaunch',
      'secondInstance',
      'singleInstance',
      'version',
    ]);
    expect(app.name.getName()).toBe('Flight');
    expect(app.version.getVersion()).toBe('1.2.3');
    expect(app.locale.getPreferredSystemLanguages()).toEqual(['en-US', 'fr']);
    expect(app.path.getAppDirectoryPath('logs')).toBe('/path/logs');
    expect(app.singleInstance.requestSingleInstanceLock()).toBe(true);
    await expect(app.badge.setBadgeCount(2)).resolves.toBe(true);
    for (const provider of Object.values(app)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('publishes macOS-only dock, visibility, login, open-file, and activation slots', () => {
    const fake = fakeElectron();
    const app = createElectronAppCapabilities(fake.electron, 'macos');
    expect(app.hiddenQuery.isAppHidden()).toBe(true);
    app.dock.setDockMenu([{ id: 'a', label: 'A', submenu: [{ id: 'b', label: 'B' }] }]);
    expect(fake.dockMenuTemplate?.[0]?.submenu).toHaveLength(1);
    expect(app.dock.requestAttention(true)).toBe(7);
    let openedPath = '';
    const off = app.openFile.subscribe((path) => (openedPath = path));
    for (const listener of fake.listeners.get('open-file') ?? []) listener({}, '/tmp/file.txt');
    expect(openedPath).toBe('/tmp/file.txt');
    off();
    expect(fake.listeners.get('open-file')).toHaveLength(0);
  });

  it('publishes Windows login, recent-document, and app-user-model slots', () => {
    const fake = fakeElectron();
    const app = createElectronAppCapabilities(fake.electron, 'windows');
    app.recentDocuments.addRecentDocument('/tmp/a');
    app.userModelId.setUserModelId('flight.app');
    expect(fake.calls).toEqual(['recent:/tmp/a', 'userModel:flight.app']);
    expect(app).not.toHaveProperty('badge');
  });

  it('adapts quit-veto and second-instance event arguments', () => {
    const fake = fakeElectron();
    const app = createElectronAppCapabilities(fake.electron, 'linux');
    const preventDefault = vi.fn();
    const cancel = vi.fn((cancelHost: () => void) => cancelHost());
    let argv: readonly string[] = [];
    app.quitRequest.subscribe(cancel);
    app.secondInstance.subscribe((next) => (argv = next));
    for (const listener of fake.listeners.get('before-quit') ?? []) listener({ preventDefault });
    for (const listener of fake.listeners.get('second-instance') ?? []) listener({}, ['--flag'], '/cwd');
    expect(cancel).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(argv).toEqual(['--flag']);
  });

  it('rejects a macOS facade whose dock API is absent', () => {
    const electron = fakeElectron().electron;
    Object.assign(electron.app, { dock: undefined });
    expect(() => createElectronAppCapabilities(electron, 'macos')).toThrow('require app.dock');
  });
});
describe('initializeAppActivateBackend', () => {
  it('is the construction initializer of createAppActivateBackend', () => {
    expect(typeof initializeAppActivateBackend).toBe('function');
  });
});

describe('initializeAppActivationPolicyBackend', () => {
  it('is the construction initializer of createAppActivationPolicyBackend', () => {
    expect(typeof initializeAppActivationPolicyBackend).toBe('function');
  });
});

describe('initializeAppAllWindowsClosedBackend', () => {
  it('is the construction initializer of createAppAllWindowsClosedBackend', () => {
    expect(typeof initializeAppAllWindowsClosedBackend).toBe('function');
  });
});

describe('initializeAppBadgeBackend', () => {
  it('is the construction initializer of createAppBadgeBackend', () => {
    expect(typeof initializeAppBadgeBackend).toBe('function');
  });
});

describe('initializeAppDockBackend', () => {
  it('is the construction initializer of createAppDockBackend', () => {
    expect(typeof initializeAppDockBackend).toBe('function');
  });
});

describe('initializeAppFocusBackend', () => {
  it('is the construction initializer of createAppFocusBackend', () => {
    expect(typeof initializeAppFocusBackend).toBe('function');
  });
});

describe('initializeAppHideBackend', () => {
  it('is the construction initializer of createAppHideBackend', () => {
    expect(typeof initializeAppHideBackend).toBe('function');
  });
});

describe('initializeAppLocaleBackend', () => {
  it('is the construction initializer of createAppLocaleBackend', () => {
    expect(typeof initializeAppLocaleBackend).toBe('function');
  });
});

describe('initializeAppLoginItemBackend', () => {
  it('is the construction initializer of createAppLoginItemBackend', () => {
    expect(typeof initializeAppLoginItemBackend).toBe('function');
  });
});

describe('initializeAppNameBackend', () => {
  it('is the construction initializer of createAppNameBackend', () => {
    expect(typeof initializeAppNameBackend).toBe('function');
  });
});

describe('initializeAppNameWriteBackend', () => {
  it('is the construction initializer of createAppNameWriteBackend', () => {
    expect(typeof initializeAppNameWriteBackend).toBe('function');
  });
});

describe('initializeAppOpenFileBackend', () => {
  it('is the construction initializer of createAppOpenFileBackend', () => {
    expect(typeof initializeAppOpenFileBackend).toBe('function');
  });
});

describe('initializeAppPathBackend', () => {
  it('is the construction initializer of createAppPathBackend', () => {
    expect(typeof initializeAppPathBackend).toBe('function');
  });
});

describe('initializeAppQuitBackend', () => {
  it('is the construction initializer of createAppQuitBackend', () => {
    expect(typeof initializeAppQuitBackend).toBe('function');
  });
});

describe('initializeAppQuitRequestBackend', () => {
  it('is the construction initializer of createAppQuitRequestBackend', () => {
    expect(typeof initializeAppQuitRequestBackend).toBe('function');
  });
});

describe('initializeAppReadyBackend', () => {
  it('is the construction initializer of createAppReadyBackend', () => {
    expect(typeof initializeAppReadyBackend).toBe('function');
  });
});

describe('initializeAppRecentDocumentsBackend', () => {
  it('is the construction initializer of createAppRecentDocumentsBackend', () => {
    expect(typeof initializeAppRecentDocumentsBackend).toBe('function');
  });
});

describe('initializeAppRelaunchBackend', () => {
  it('is the construction initializer of createAppRelaunchBackend', () => {
    expect(typeof initializeAppRelaunchBackend).toBe('function');
  });
});

describe('initializeAppSecondInstanceBackend', () => {
  it('is the construction initializer of createAppSecondInstanceBackend', () => {
    expect(typeof initializeAppSecondInstanceBackend).toBe('function');
  });
});

describe('initializeAppShowBackend', () => {
  it('is the construction initializer of createAppShowBackend', () => {
    expect(typeof initializeAppShowBackend).toBe('function');
  });
});

describe('initializeAppSingleInstanceBackend', () => {
  it('is the construction initializer of createAppSingleInstanceBackend', () => {
    expect(typeof initializeAppSingleInstanceBackend).toBe('function');
  });
});

describe('initializeAppUserModelIdBackend', () => {
  it('is the construction initializer of createAppUserModelIdBackend', () => {
    expect(typeof initializeAppUserModelIdBackend).toBe('function');
  });
});

describe('initializeAppVersionBackend', () => {
  it('is the construction initializer of createAppVersionBackend', () => {
    expect(typeof initializeAppVersionBackend).toBe('function');
  });
});

describe('initializeAppVisibilityQueryBackend', () => {
  it('is the construction initializer of createAppVisibilityQueryBackend', () => {
    expect(typeof initializeAppVisibilityQueryBackend).toBe('function');
  });
});

describe('initializeElectronCommonAppCapabilities', () => {
  it('is the construction initializer of createElectronCommonAppCapabilities', () => {
    expect(typeof initializeElectronCommonAppCapabilities).toBe('function');
  });
});

describe('initializeElectronLinuxAppCapabilities', () => {
  it('is the construction initializer of createElectronLinuxAppCapabilities', () => {
    expect(typeof initializeElectronLinuxAppCapabilities).toBe('function');
  });
});

describe('initializeElectronMacosAppCapabilities', () => {
  it('is the construction initializer of createElectronMacosAppCapabilities', () => {
    expect(typeof initializeElectronMacosAppCapabilities).toBe('function');
  });
});

describe('initializeElectronWindowsAppCapabilities', () => {
  it('is the construction initializer of createElectronWindowsAppCapabilities', () => {
    expect(typeof initializeElectronWindowsAppCapabilities).toBe('function');
  });
});
