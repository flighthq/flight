import type { MenuApplicationBackend, MenuPopupBackend, MenuSelectBackend } from '@flighthq/types/contract';
import type { MenuItemTemplate, TauriApi, TauriMenuItemOptions } from '@flighthq/types/contract';

import { createTauriMenuBackends } from './tauriMenu';

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

describe('createTauriMenuBackends', () => {
  it('installs an application menu and routes item clicks to the select listener', async () => {
    const { tauri, state } = fakeTauri();
    const backend = _slots(tauri);
    const selected: string[] = [];
    backend.subscribeSelect((id: string) => selected.push(id));
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
    const backend = _slots(tauri);
    const pending = backend.popupContextMenu([{ id: 'cut', label: 'Cut' }], 10, 20);
    await flush();
    expect(state.popups).toBe(1);
    state.actions.get('cut')!('cut');
    expect(await pending).toBe('cut');
  });

  it('does not touch native menu on destroy (async API cannot clear synchronously)', async () => {
    const { tauri, state } = fakeTauri();
    const backend = _slots(tauri);
    backend.setApplicationMenu(template);
    await flush();
    expect(state.appMenuSet).toBe(1);
    backend.destroy?.();
    await flush();
    expect(state.appMenuSet).toBe(1);
  });

  it('is idempotent on double destroy', async () => {
    const { tauri, state } = fakeTauri();
    const backend = _slots(tauri);
    const selected: string[] = [];
    backend.subscribeSelect((id: string) => selected.push(id));
    backend.setApplicationMenu(template);
    await flush();
    backend.destroy?.();
    backend.destroy?.();
    await flush();
    // Idempotency is about the PROVIDER: a second destroy must not install or clear a second time.
    // It says nothing about subscriptions, which end only through their own unsubscribe.
    expect(state.appMenuSet).toBe(1);
    state.actions.get('open')!('open');
    expect(selected).toEqual(['open']);
  });

  it('outgoing destroy cannot overwrite successor menu in a controlled replacement race', async () => {
    const { tauri, state } = fakeTauri();
    const outgoing = _slots(tauri);
    outgoing.setApplicationMenu(template);
    await flush();
    expect(state.appMenuSet).toBe(1);
    outgoing.destroy?.();
    const incoming = _slots(tauri);
    incoming.setApplicationMenu([{ id: 'save', label: 'Save' }]);
    await flush();
    expect(state.appMenuSet).toBe(2);
  });

  // destroy is provider lifecycle; the select subscription ends only via its own unsubscribe.
  it('leaves select subscriptions alive across destroy', async () => {
    const { tauri } = fakeTauri();
    const backend = _slots(tauri);
    const selected: string[] = [];
    const unsubscribe = backend.subscribeSelect((id: string) => selected.push(id));
    backend.setApplicationMenu(template);
    await flush();
    backend.destroy?.();
    expect(() => unsubscribe()).not.toThrow();
    expect(selected).toEqual([]);
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
    expect(await _slots(tauri).popupContextMenu([{ id: 'a', label: 'A' }], 0, 0)).toBeNull();
  });
});

async function flush(): Promise<void> {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

// The merged MenuBackend is gone; these tests exercise the three slots that replaced it. This helper
// recomposes the old surface so each assertion still names the operation it is really testing.
function _slots(api: TauriApi): {
  destroy?: () => void;
  popupContextMenu: MenuPopupBackend['popup'];
  setApplicationMenu: MenuApplicationBackend['setApplicationMenu'];
  subscribeSelect: MenuSelectBackend['subscribe'];
} {
  const { application, popup, select } = createTauriMenuBackends(api);
  return {
    destroy: application.destroy?.bind(application),
    popupContextMenu: popup.popup,
    setApplicationMenu: application.setApplicationMenu,
    subscribeSelect: select.subscribe,
  };
}
