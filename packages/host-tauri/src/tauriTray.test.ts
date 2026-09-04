import {
  createTrayIcon,
  destroyTrayIcon,
  onTrayInteraction,
  onTrayMenuSelection,
  setTrayIcon,
  setTrayIconContextMenu,
  setTrayIconTemplate,
} from '@flighthq/tray/contract';
import type {
  TauriApi,
  TauriMenu,
  TauriMenuItemOptions,
  TauriTrayIcon,
  TauriTrayIconEvent,
  TauriTrayIconOptions,
  TrayIconForHost,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { createTauriTrayCapabilities, initializeTauriTrayCapabilities } from './tauriTray';

interface FakeIcon extends TauriTrayIcon {
  closeFailures: number;
  closed: number;
  installed: TauriMenu[];
  template: boolean;
}

function fakeTauri() {
  const icons: FakeIcon[] = [];
  const menuActions: TauriMenuItemOptions[] = [];
  const menus: Array<TauriMenu & { closed: number }> = [];
  let action: ((event: Readonly<TauriTrayIconEvent>) => void) | null = null;
  const tauri = {
    tray: {
      TrayIcon: {
        async new(options?: TauriTrayIconOptions) {
          action = options?.action ?? null;
          const icon: FakeIcon = {
            closeFailures: 0,
            closed: 0,
            installed: [],
            template: false,
            async close() {
              if (icon.closeFailures-- > 0) throw new Error('close failed');
              icon.closed++;
            },
            async setIcon() {},
            async setIconAsTemplate(value) {
              icon.template = value;
            },
            async setMenu(menu) {
              if (menu !== null) icon.installed.push(menu);
            },
            async setTitle() {},
            async setTooltip() {},
          };
          icons.push(icon);
          return icon;
        },
      },
    },
    menu: {
      Menu: {
        async new() {
          const menu = {
            closed: 0,
            async close() {
              menu.closed++;
            },
            async popup() {},
            async setAsAppMenu() {},
          };
          menus.push(menu);
          return menu;
        },
      },
      MenuItem: {
        async new(options?: TauriMenuItemOptions) {
          menuActions.push(options ?? {});
          return { id: options?.id ?? '' };
        },
      },
      PredefinedMenuItem: {
        async new() {
          return { id: 'separator' };
        },
      },
      Submenu: {
        async new() {
          return { id: 'submenu' };
        },
      },
    },
  } as unknown as TauriApi;
  return { action: () => action, icons, menuActions, menus, tauri };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

async function acquire<
  Host extends { tray: { lifecycle: ReturnType<typeof createTauriTrayCapabilities>['lifecycle'] } },
>(host: Host): Promise<TrayIconForHost<Host>> {
  const result = await createTrayIcon(host, { icon: 'icon.png' });
  if (result.outcome !== 'created') throw new Error(result.outcome);
  return result.tray;
}

describe('createTauriTrayCapabilities', () => {
  it('exposes only the slots supported by the injected OS profile', () => {
    const { tauri } = fakeTauri();
    expect(Object.keys(createTauriTrayCapabilities(tauri, 'linux')).sort()).toEqual(
      ['image', 'lifecycle', 'menu', 'menuSelectionEvents', 'title'].sort(),
    );
    expect(Object.keys(createTauriTrayCapabilities(tauri, 'macos')).sort()).toEqual(
      [
        'image',
        'interactionEvents',
        'lifecycle',
        'menu',
        'menuSelectionEvents',
        'templateImage',
        'title',
        'tooltip',
      ].sort(),
    );
    expect(Object.keys(createTauriTrayCapabilities(tauri, 'windows')).sort()).toEqual(
      ['image', 'interactionEvents', 'lifecycle', 'menu', 'menuSelectionEvents', 'tooltip'].sort(),
    );
  });

  it('publishes only after asynchronous native acquisition resolves', async () => {
    const { tauri } = fakeTauri();
    let resolve!: (icon: TauriTrayIcon) => void;
    tauri.tray.TrayIcon.new = () =>
      new Promise((accept) => {
        resolve = accept;
      });
    const host = { tray: createTauriTrayCapabilities(tauri, 'linux') };
    const pending = createTrayIcon(host, { icon: 'icon.png' });
    expect(host.tray.lifecycle.list()).toEqual([]);
    resolve({
      async close() {},
      async setIcon() {},
      async setIconAsTemplate() {},
      async setMenu() {},
      async setTitle() {},
      async setTooltip() {},
    });
    expect((await pending).outcome).toBe('created');
    expect(host.tray.lifecycle.list()).toHaveLength(1);
  });

  it('closes an eventual resource when acquisition is aborted while pending', async () => {
    const { tauri } = fakeTauri();
    let resolve!: (icon: TauriTrayIcon) => void;
    tauri.tray.TrayIcon.new = () =>
      new Promise((accept) => {
        resolve = accept;
      });
    const host = { tray: createTauriTrayCapabilities(tauri, 'linux') };
    const controller = new AbortController();
    const pending = createTrayIcon(host, { icon: 'icon.png', signal: controller.signal });
    controller.abort();
    const close = vi.fn(async () => {});
    resolve({
      close,
      async setIcon() {},
      async setIconAsTemplate() {},
      async setMenu() {},
      async setTitle() {},
      async setTooltip() {},
    });
    expect((await pending).outcome).toBe('cancelled');
    expect(close).toHaveBeenCalledOnce();
    expect(host.tray.lifecycle.list()).toEqual([]);
  });

  it('does not publish a ghost when native acquisition rejects', async () => {
    const { tauri } = fakeTauri();
    tauri.tray.TrayIcon.new = async () => {
      throw new Error('rejected');
    };
    const host = { tray: createTauriTrayCapabilities(tauri, 'linux') };
    expect((await createTrayIcon(host, { icon: 'icon.png' })).outcome).toBe('tray-create-failed');
    expect(host.tray.lifecycle.list()).toEqual([]);
  });

  it('delivers interaction payload through the profile-owned signal', async () => {
    const { action, tauri } = fakeTauri();
    const host = { tray: createTauriTrayCapabilities(tauri, 'macos') };
    const tray = await acquire(host);
    const listener = vi.fn();
    onTrayInteraction(tray, listener);
    action()!({ button: 'Right', position: { x: 5, y: 6 }, type: 'Click' });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ position: { x: 5, y: 6 }, type: 'rightClick' }));
  });

  it('routes menu selection per Tray and replaces the previous menu transactionally', async () => {
    const { icons, menuActions, menus, tauri } = fakeTauri();
    const host = { tray: createTauriTrayCapabilities(tauri, 'linux') };
    const tray = await acquire(host);
    const selected: string[] = [];
    onTrayMenuSelection(tray, ({ id }) => selected.push(id));
    expect((await setTrayIconContextMenu(tray, [{ id: 'old', label: 'Old' }])).outcome).toBe('updated');
    expect((await setTrayIconContextMenu(tray, [{ id: 'new', label: 'New' }])).outcome).toBe('updated');
    menuActions[1].action?.('new');
    expect(selected).toEqual(['new']);
    expect(icons[0].installed).toEqual([menus[0], menus[1]]);
    expect(menus[0].closed).toBe(1);
    expect(menus[1].closed).toBe(0);
  });

  it('keeps the newest async menu and closes a stale build', async () => {
    const { icons, tauri } = fakeTauri();
    const resolvers: Array<(menu: TauriMenu) => void> = [];
    tauri.menu.Menu.new = () => new Promise((resolve) => resolvers.push(resolve));
    const host = { tray: createTauriTrayCapabilities(tauri, 'linux') };
    const tray = await acquire(host);
    const old = setTrayIconContextMenu(tray, [{ id: 'old' }]);
    const newest = setTrayIconContextMenu(tray, [{ id: 'new' }]);
    await flushMicrotasks();
    const oldClose = vi.fn(async () => {});
    const newClose = vi.fn(async () => {});
    resolvers[1]!({ close: newClose, async popup() {}, async setAsAppMenu() {} });
    expect((await newest).outcome).toBe('updated');
    resolvers[0]!({ close: oldClose, async popup() {}, async setAsAppMenu() {} });
    expect((await old).outcome).toBe('menu-install-failed');
    expect(icons[0].installed).toHaveLength(1);
    expect(oldClose).toHaveBeenCalledOnce();
  });

  it('uses typed async updates and macOS template treatment', async () => {
    const { icons, tauri } = fakeTauri();
    const host = { tray: createTauriTrayCapabilities(tauri, 'macos') };
    const tray = await acquire(host);
    expect((await setTrayIcon(tray, 'next.png')).outcome).toBe('updated');
    expect((await setTrayIconTemplate(tray, true)).outcome).toBe('updated');
    expect(icons[0].template).toBe(true);
  });

  it('attempts menu and native teardown and retries only failed native steps', async () => {
    const { icons, menus, tauri } = fakeTauri();
    const host = { tray: createTauriTrayCapabilities(tauri, 'linux') };
    const tray = await acquire(host);
    await setTrayIconContextMenu(tray, [{ id: 'quit' }]);
    icons[0].closeFailures = 1;
    expect((await destroyTrayIcon(tray)).outcome).toBe('tray-destroy-failed');
    expect(menus[0].closed).toBe(1);
    expect((await destroyTrayIcon(tray)).outcome).toBe('destroyed');
    expect(menus[0].closed).toBe(1);
    expect(icons[0].closed).toBe(1);
  });
});
describe('initializeTauriTrayCapabilities', () => {
  it('is the construction initializer of createTauriTrayCapabilities', () => {
    expect(typeof initializeTauriTrayCapabilities).toBe('function');
  });
});
