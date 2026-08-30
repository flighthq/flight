import type { ElectronApi, ElectronMenu, ElectronMenuItemOptions } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { createElectronAppCapabilities } from './electronApp';

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
