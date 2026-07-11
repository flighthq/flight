import type { MenuItemTemplate } from '@flighthq/types';

import { createTauriMenuBackend } from './tauriMenu';
import type { TauriApi, TauriMenuItemOptions } from './tauriModule';

function fakeTauri() {
  const state = {
    appMenuSet: 0,
    popups: 0,
    // Action callbacks captured from built MenuItems, keyed by their id.
    actions: new Map<string, (id: string) => void>(),
    predefined: 0,
  };
  const makeMenu = () => ({
    async setAsAppMenu() {
      state.appMenuSet++;
    },
    async popup() {
      state.popups++;
    },
  });
  const tauri = {
    menu: {
      Menu: {
        async new() {
          return makeMenu();
        },
      },
      MenuItem: {
        async new(options?: TauriMenuItemOptions) {
          if (options?.id && options.action) state.actions.set(options.id, options.action);
          return { id: options?.id ?? '' };
        },
      },
      Submenu: {
        async new() {
          return { id: 'submenu' };
        },
      },
      PredefinedMenuItem: {
        async new() {
          state.predefined++;
          return { id: 'separator' };
        },
      },
    },
    window: {
      LogicalPosition: class {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
    },
  } as unknown as TauriApi;
  return { tauri, state };
}

const template: MenuItemTemplate[] = [
  { id: 'open', label: 'Open' },
  { type: 'separator' },
  { label: 'More', submenu: [{ id: 'nested', label: 'Nested' }] },
];

describe('createTauriMenuBackend', () => {
  it('installs an application menu and routes item clicks to the select listener', async () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriMenuBackend(tauri);
    const selected: string[] = [];
    backend.subscribeSelect((id) => selected.push(id));
    expect(backend.setApplicationMenu(template)).toBe(true);
    // Let the async build + setAsAppMenu settle.
    await flush();
    expect(state.appMenuSet).toBe(1);
    expect(state.predefined).toBe(1);
    state.actions.get('open')!('open');
    expect(selected).toEqual(['open']);
  });

  it('resolves popupContextMenu with the clicked item id', async () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriMenuBackend(tauri);
    const pending = backend.popupContextMenu([{ id: 'cut', label: 'Cut' }], 10, 20);
    await flush();
    expect(state.popups).toBe(1);
    state.actions.get('cut')!('cut');
    expect(await pending).toBe('cut');
  });

  it('resolves popupContextMenu null when the build throws', async () => {
    const tauri = {
      menu: {
        Menu: {
          async new() {
            throw new Error('no menu');
          },
        },
        MenuItem: {
          async new() {
            return { id: 'x' };
          },
        },
        Submenu: {
          async new() {
            return { id: 's' };
          },
        },
        PredefinedMenuItem: {
          async new() {
            return { id: 'sep' };
          },
        },
      },
      window: {
        LogicalPosition: class {
          constructor(
            public x: number,
            public y: number,
          ) {}
        },
      },
    } as unknown as TauriApi;
    expect(await createTauriMenuBackend(tauri).popupContextMenu([{ id: 'a', label: 'A' }], 0, 0)).toBeNull();
  });
});

async function flush(): Promise<void> {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
