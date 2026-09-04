import type { MenuApplicationBackend, MenuPopupBackend, MenuSelectBackend } from '@flighthq/types/contract';
import type { ElectronApi, ElectronMenu, ElectronMenuItemOptions } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createElectronMenuBackends,
  initializeElectronMenuCapabilities,
  initializeMenuApplicationBackend,
  initializeMenuPopupBackend,
  initializeMenuSelectBackend,
} from './electronMenu';

function fakeElectron(): {
  electron: ElectronApi;
  built: ElectronMenuItemOptions[][];
  applied: (ElectronMenu | null)[];
  popups: { x?: number; y?: number }[];
} {
  const built: ElectronMenuItemOptions[][] = [];
  const applied: (ElectronMenu | null)[] = [];
  const popups: { x?: number; y?: number }[] = [];
  const electron = {
    Menu: {
      buildFromTemplate: (template: ElectronMenuItemOptions[]) => {
        built.push(template);
        return {
          template,
          popup: (options?: { x?: number; y?: number }) => {
            popups.push(options ?? {});
          },
        } as unknown as ElectronMenu;
      },
      setApplicationMenu: (menu: ElectronMenu | null) => {
        applied.push(menu);
      },
    },
  } as unknown as ElectronApi;
  return { electron, built, applied, popups };
}

// Clicks the menu item with the given id from the most recently built template.
function clickItem(built: ElectronMenuItemOptions[][], id: string): void {
  const findIn = (items: ElectronMenuItemOptions[]): ElectronMenuItemOptions | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.submenu) {
        const found = findIn(item.submenu);
        if (found) return found;
      }
    }
    return undefined;
  };
  const item = findIn(built[built.length - 1]);
  item?.click?.();
}

describe('createElectronMenuBackends', () => {
  it('returns an Entity-composed capability bundle and providers', () => {
    const capabilities = createElectronMenuBackends(fakeElectron().electron);
    expect(EntityRuntimeKey in capabilities).toBe(true);
    for (const provider of Object.values(capabilities)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('builds and applies the application menu and reports clicks via subscribeSelect', () => {
    const { electron, built, applied } = fakeElectron();
    const backend = _slots(electron);
    const seen: string[] = [];
    backend.subscribeSelect((id: string) => seen.push(id));
    expect(
      backend.setApplicationMenu([
        { id: 'open', label: 'Open' },
        { label: 'Edit', submenu: [{ id: 'copy', label: 'Copy' }] },
      ]),
    ).toBe(true);
    expect(applied.length).toBe(1);
    clickItem(built, 'open');
    clickItem(built, 'copy');
    expect(seen).toEqual(['open', 'copy']);
  });

  it('stops delivering selects after unsubscribe', () => {
    const { electron, built } = fakeElectron();
    const backend = _slots(electron);
    const seen: string[] = [];
    const unsubscribe = backend.subscribeSelect((id: string) => seen.push(id));
    backend.setApplicationMenu([{ id: 'a', label: 'A' }]);
    unsubscribe();
    clickItem(built, 'a');
    expect(seen).toEqual([]);
  });

  it('clears the native application menu on destroy', () => {
    const { electron, applied } = fakeElectron();
    const backend = _slots(electron);
    backend.setApplicationMenu([{ id: 'a', label: 'A' }]);
    expect(applied.length).toBe(1);
    backend.destroy?.();
    expect(applied.length).toBe(2);
    expect(applied[1]).toBeNull();
  });

  it('clears the native application menu exactly once on double destroy', () => {
    const { electron, applied } = fakeElectron();
    const backend = _slots(electron);
    backend.setApplicationMenu([{ id: 'a', label: 'A' }]);
    expect(applied.length).toBe(1);
    backend.destroy?.();
    backend.destroy?.();
    expect(applied.length).toBe(2);
    expect(applied[1]).toBeNull();
  });

  // ★ destroy is PROVIDER lifecycle and is deliberately separate from subscription teardown: it releases
  // the OS menu, and the select subscription ends only through its own unsubscribe. Conflating the two —
  // which the merged backend did — meant tearing down a provider silently killed every subscriber.
  it('releases the native menu on destroy without ending select subscriptions', () => {
    const { electron, built } = fakeElectron();
    const backend = _slots(electron);
    const seen: string[] = [];
    const unsubscribe = backend.subscribeSelect((id: string) => seen.push(id));
    backend.setApplicationMenu([{ id: 'a', label: 'A' }]);
    backend.destroy?.();
    clickItem(built, 'a');
    expect(seen).toEqual(['a']);

    // The subscription's own unsubscribe is what ends it.
    unsubscribe();
    clickItem(built, 'a');
    expect(seen).toEqual(['a']);
  });

  it('resolves the context menu promise with the clicked id', async () => {
    const { electron, built, popups } = fakeElectron();
    const backend = _slots(electron);
    const pending = backend.popupContextMenu([{ id: 'paste', label: 'Paste' }], 10, 20);
    expect(popups).toEqual([{ x: 10, y: 20 }]);
    clickItem(built, 'paste');
    expect(await pending).toBe('paste');
  });
});

// The merged MenuBackend is gone; these tests exercise the three slots that replaced it. This helper
// recomposes the old surface so each assertion still names the operation it is really testing.
function _slots(api: ElectronApi): {
  destroy?: () => void;
  popupContextMenu: MenuPopupBackend['popup'];
  setApplicationMenu: MenuApplicationBackend['setApplicationMenu'];
  subscribeSelect: MenuSelectBackend['subscribe'];
} {
  const { application, popup, select } = createElectronMenuBackends(api);
  return {
    destroy: application.destroy?.bind(application),
    popupContextMenu: popup.popup,
    setApplicationMenu: application.setApplicationMenu,
    subscribeSelect: select.subscribe,
  };
}
describe('initializeElectronMenuCapabilities', () => {
  it('is the construction initializer of createElectronMenuCapabilities', () => {
    expect(typeof initializeElectronMenuCapabilities).toBe('function');
  });
});

describe('initializeMenuApplicationBackend', () => {
  it('is the construction initializer of createMenuApplicationBackend', () => {
    expect(typeof initializeMenuApplicationBackend).toBe('function');
  });
});

describe('initializeMenuPopupBackend', () => {
  it('is the construction initializer of createMenuPopupBackend', () => {
    expect(typeof initializeMenuPopupBackend).toBe('function');
  });
});

describe('initializeMenuSelectBackend', () => {
  it('is the construction initializer of createMenuSelectBackend', () => {
    expect(typeof initializeMenuSelectBackend).toBe('function');
  });
});
