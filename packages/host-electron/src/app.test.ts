import type { ElectronApi, ElectronMenu, ElectronMenuItemOptions } from './electronModule';
import { createElectronAppBackend } from './app';

function fakeElectron(): {
  electron: ElectronApi;
  listeners: Map<string, ((...args: unknown[]) => void)[]>;
  dockMenuTemplate: ElectronMenuItemOptions[] | null;
  badgeText: string | null;
} {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const box = { dockMenuTemplate: null as ElectronMenuItemOptions[] | null, badgeText: null as string | null };
  const electron = {
    app: {
      getName: () => 'Flight',
      getVersion: () => '1.2.3',
      getLocale: () => 'en-US',
      quit: () => {},
      relaunch: () => {},
      focus: () => {},
      requestSingleInstanceLock: () => true,
      releaseSingleInstanceLock: () => {},
      hasSingleInstanceLock: () => true,
      setBadgeCount: () => true,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeListener: (event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        listeners.set(
          event,
          list.filter((l) => l !== listener),
        );
      },
      dock: {
        bounce: () => 7,
        cancelBounce: () => {},
        setBadge: (text: string) => {
          box.badgeText = text;
        },
        setMenu: () => {},
      },
    },
    Menu: {
      buildFromTemplate: (template: ElectronMenuItemOptions[]): ElectronMenu => {
        box.dockMenuTemplate = template;
        return {} as ElectronMenu;
      },
    },
  } as unknown as ElectronApi;
  return {
    electron,
    listeners,
    get dockMenuTemplate() {
      return box.dockMenuTemplate;
    },
    get badgeText() {
      return box.badgeText;
    },
  };
}

describe('createElectronAppBackend', () => {
  it('delegates identity and lifecycle to electron.app', () => {
    const { electron } = fakeElectron();
    const backend = createElectronAppBackend(electron);
    expect(backend.getName()).toBe('Flight');
    expect(backend.getVersion()).toBe('1.2.3');
    expect(backend.getLocale()).toBe('en-US');
    expect(backend.requestSingleInstanceLock()).toBe(true);
    expect(backend.hasSingleInstanceLock()).toBe(true);
    expect(backend.setBadgeCount(3)).toBe(true);
  });

  it('builds a dock menu from the item template', () => {
    const fake = fakeElectron();
    const backend = createElectronAppBackend(fake.electron);
    backend.setDockMenu([{ id: 'a', label: 'A', submenu: [{ id: 'b', label: 'B' }] }]);
    expect(fake.dockMenuTemplate).toEqual([
      {
        id: 'a',
        label: 'A',
        type: undefined,
        role: undefined,
        accelerator: undefined,
        enabled: undefined,
        checked: undefined,
        submenu: [
          {
            id: 'b',
            label: 'B',
            type: undefined,
            role: undefined,
            accelerator: undefined,
            enabled: undefined,
            checked: undefined,
          },
        ],
      },
    ]);
  });

  it('drives dock badge and bounce, returning the bounce id', () => {
    const fake = fakeElectron();
    const backend = createElectronAppBackend(fake.electron);
    backend.setDockBadge('5');
    expect(fake.badgeText).toBe('5');
    expect(backend.bounceDock()).toBe(7);
  });

  it('subscribes to activate and unsubscribes', () => {
    const fake = fakeElectron();
    const backend = createElectronAppBackend(fake.electron);
    let count = 0;
    const off = backend.subscribeActivate(() => {
      count++;
    });
    for (const l of fake.listeners.get('activate') ?? []) l();
    expect(count).toBe(1);
    off();
    expect(fake.listeners.get('activate')).toHaveLength(0);
  });

  it('adapts open-file and second-instance argument shapes', () => {
    const fake = fakeElectron();
    const backend = createElectronAppBackend(fake.electron);
    let openedPath = '';
    let argv: readonly string[] = [];
    backend.subscribeOpenFile((path) => {
      openedPath = path;
    });
    backend.subscribeSecondInstance((next) => {
      argv = next;
    });
    for (const l of fake.listeners.get('open-file') ?? []) l({}, '/tmp/file.txt');
    for (const l of fake.listeners.get('second-instance') ?? []) l({}, ['--flag'], '/cwd');
    expect(openedPath).toBe('/tmp/file.txt');
    expect(argv).toEqual(['--flag']);
  });
});
