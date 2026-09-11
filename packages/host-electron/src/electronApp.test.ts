import type { ElectronApi, ElectronMenu, ElectronMenuItemOptions } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  electronHostApp,
  populateElectronHostAppActivate,
  populateElectronHostAppActivationPolicy,
  populateElectronHostAppAllWindowsClosed,
  populateElectronHostAppBadge,
  populateElectronHostAppDock,
  populateElectronHostAppFocus,
  populateElectronHostAppHide,
  populateElectronHostAppLocale,
  populateElectronHostAppLoginItem,
  populateElectronHostAppName,
  populateElectronHostAppNameWrite,
  populateElectronHostAppOpenFile,
  populateElectronHostAppPath,
  populateElectronHostAppQuit,
  populateElectronHostAppQuitRequest,
  populateElectronHostAppReady,
  populateElectronHostAppRecentDocuments,
  populateElectronHostAppRelaunch,
  populateElectronHostAppSecondInstance,
  populateElectronHostAppShow,
  populateElectronHostAppSingleInstance,
  populateElectronHostAppUserModelId,
  populateElectronHostAppVersion,
  populateElectronHostAppHiddenQuery,
  populateElectronHostAppCommon,
  populateElectronHostAppLinux,
  populateElectronHostAppMacos,
  populateElectronHostAppWindows,
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

function appLeaf(profile: 'linux' | 'macos' | 'windows', slot: string): () => void {
  return () => {
    it('constructs an Entity-backed provider in the application group', () => {
      const app = electronHostApp(fakeElectron().electron, profile) as unknown as Record<string, object>;
      expect(EntityRuntimeKey in app[slot]).toBe(true);
    });
  };
}

describe('electronHostApp', () => {
  it('publishes common application identity, control, and event slots on every profile', async () => {
    const fake = fakeElectron();
    const app = electronHostApp(fake.electron, 'linux');
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
    const app = electronHostApp(fake.electron, 'macos');
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
    const app = electronHostApp(fake.electron, 'windows');
    app.recentDocuments.addRecentDocument('/tmp/a');
    app.userModelId.setUserModelId('flight.app');
    expect(fake.calls).toEqual(['recent:/tmp/a', 'userModel:flight.app']);
    expect(app).not.toHaveProperty('badge');
  });

  it('adapts quit-veto and second-instance event arguments', () => {
    const fake = fakeElectron();
    const app = electronHostApp(fake.electron, 'linux');
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
    expect(() => electronHostApp(electron, 'macos')).toThrow('require app.dock');
  });
});
describe('electronHostAppActivate', appLeaf('macos', 'activate'));
describe('electronHostAppActivationPolicy', appLeaf('macos', 'activationPolicy'));
describe('electronHostAppAllWindowsClosed', appLeaf('linux', 'allWindowsClosed'));
describe('electronHostAppBadge', appLeaf('linux', 'badge'));
describe('electronHostAppDock', appLeaf('macos', 'dock'));
describe('electronHostAppFocus', appLeaf('linux', 'focus'));
describe('electronHostAppHiddenQuery', appLeaf('macos', 'hiddenQuery'));
describe('electronHostAppHide', appLeaf('macos', 'hide'));
describe('electronHostAppLocale', appLeaf('linux', 'locale'));
describe('electronHostAppLoginItem', appLeaf('windows', 'loginItem'));
describe('electronHostAppName', appLeaf('linux', 'name'));
describe('electronHostAppNameWrite', appLeaf('linux', 'nameWrite'));
describe('electronHostAppOpenFile', appLeaf('macos', 'openFile'));
describe('electronHostAppPath', appLeaf('linux', 'path'));
describe('electronHostAppQuit', appLeaf('linux', 'quit'));
describe('electronHostAppQuitRequest', appLeaf('linux', 'quitRequest'));
describe('electronHostAppReady', appLeaf('linux', 'ready'));
describe('electronHostAppRecentDocuments', appLeaf('windows', 'recentDocuments'));
describe('electronHostAppRelaunch', appLeaf('linux', 'relaunch'));
describe('electronHostAppSecondInstance', appLeaf('linux', 'secondInstance'));
describe('electronHostAppShow', appLeaf('macos', 'show'));
describe('electronHostAppSingleInstance', appLeaf('linux', 'singleInstance'));
describe('electronHostAppUserModelId', appLeaf('windows', 'userModelId'));

describe('electronHostAppVersion', appLeaf('linux', 'version'));
describe('populateElectronHostAppActivate', () => {
  it('is the construction initializer of electronHostAppActivate', () => {
    expect(typeof populateElectronHostAppActivate).toBe('function');
  });
});

describe('populateElectronHostAppActivationPolicy', () => {
  it('is the construction initializer of electronHostAppActivationPolicy', () => {
    expect(typeof populateElectronHostAppActivationPolicy).toBe('function');
  });
});

describe('populateElectronHostAppAllWindowsClosed', () => {
  it('is the construction initializer of electronHostAppAllWindowsClosed', () => {
    expect(typeof populateElectronHostAppAllWindowsClosed).toBe('function');
  });
});

describe('populateElectronHostAppBadge', () => {
  it('is the construction initializer of electronHostAppBadge', () => {
    expect(typeof populateElectronHostAppBadge).toBe('function');
  });
});

describe('populateElectronHostAppCommon', () => {
  it('is the construction initializer of electronHostApp', () => {
    expect(typeof populateElectronHostAppCommon).toBe('function');
  });
});

describe('populateElectronHostAppDock', () => {
  it('is the construction initializer of electronHostAppDock', () => {
    expect(typeof populateElectronHostAppDock).toBe('function');
  });
});

describe('populateElectronHostAppFocus', () => {
  it('is the construction initializer of electronHostAppFocus', () => {
    expect(typeof populateElectronHostAppFocus).toBe('function');
  });
});

describe('populateElectronHostAppHiddenQuery', () => {
  it('is the construction initializer of electronHostAppVisibilityQuery', () => {
    expect(typeof populateElectronHostAppHiddenQuery).toBe('function');
  });
});

describe('populateElectronHostAppHide', () => {
  it('is the construction initializer of electronHostAppHide', () => {
    expect(typeof populateElectronHostAppHide).toBe('function');
  });
});

describe('populateElectronHostAppLinux', () => {
  it('is the construction initializer of electronHostApp', () => {
    expect(typeof populateElectronHostAppLinux).toBe('function');
  });
});

describe('populateElectronHostAppLocale', () => {
  it('is the construction initializer of electronHostAppLocale', () => {
    expect(typeof populateElectronHostAppLocale).toBe('function');
  });
});

describe('populateElectronHostAppLoginItem', () => {
  it('is the construction initializer of electronHostAppLoginItem', () => {
    expect(typeof populateElectronHostAppLoginItem).toBe('function');
  });
});

describe('populateElectronHostAppMacos', () => {
  it('is the construction initializer of electronHostApp', () => {
    expect(typeof populateElectronHostAppMacos).toBe('function');
  });
});

describe('populateElectronHostAppName', () => {
  it('is the construction initializer of electronHostAppName', () => {
    expect(typeof populateElectronHostAppName).toBe('function');
  });
});

describe('populateElectronHostAppNameWrite', () => {
  it('is the construction initializer of electronHostAppNameWrite', () => {
    expect(typeof populateElectronHostAppNameWrite).toBe('function');
  });
});

describe('populateElectronHostAppOpenFile', () => {
  it('is the construction initializer of electronHostAppOpenFile', () => {
    expect(typeof populateElectronHostAppOpenFile).toBe('function');
  });
});

describe('populateElectronHostAppPath', () => {
  it('is the construction initializer of electronHostAppPath', () => {
    expect(typeof populateElectronHostAppPath).toBe('function');
  });
});

describe('populateElectronHostAppQuit', () => {
  it('is the construction initializer of electronHostAppQuit', () => {
    expect(typeof populateElectronHostAppQuit).toBe('function');
  });
});

describe('populateElectronHostAppQuitRequest', () => {
  it('is the construction initializer of electronHostAppQuitRequest', () => {
    expect(typeof populateElectronHostAppQuitRequest).toBe('function');
  });
});

describe('populateElectronHostAppReady', () => {
  it('is the construction initializer of electronHostAppReady', () => {
    expect(typeof populateElectronHostAppReady).toBe('function');
  });
});

describe('populateElectronHostAppRecentDocuments', () => {
  it('is the construction initializer of electronHostAppRecentDocuments', () => {
    expect(typeof populateElectronHostAppRecentDocuments).toBe('function');
  });
});

describe('populateElectronHostAppRelaunch', () => {
  it('is the construction initializer of electronHostAppRelaunch', () => {
    expect(typeof populateElectronHostAppRelaunch).toBe('function');
  });
});

describe('populateElectronHostAppSecondInstance', () => {
  it('is the construction initializer of electronHostAppSecondInstance', () => {
    expect(typeof populateElectronHostAppSecondInstance).toBe('function');
  });
});

describe('populateElectronHostAppShow', () => {
  it('is the construction initializer of electronHostAppShow', () => {
    expect(typeof populateElectronHostAppShow).toBe('function');
  });
});

describe('populateElectronHostAppSingleInstance', () => {
  it('is the construction initializer of electronHostAppSingleInstance', () => {
    expect(typeof populateElectronHostAppSingleInstance).toBe('function');
  });
});

describe('populateElectronHostAppUserModelId', () => {
  it('is the construction initializer of electronHostAppUserModelId', () => {
    expect(typeof populateElectronHostAppUserModelId).toBe('function');
  });
});

describe('populateElectronHostAppVersion', () => {
  it('is the construction initializer of electronHostAppVersion', () => {
    expect(typeof populateElectronHostAppVersion).toBe('function');
  });
});

describe('populateElectronHostAppWindows', () => {
  it('is the construction initializer of electronHostApp', () => {
    expect(typeof populateElectronHostAppWindows).toBe('function');
  });
});
