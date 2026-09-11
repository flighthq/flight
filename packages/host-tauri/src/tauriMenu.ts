import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostMenuApplicationProvider,
  MenuItemTemplate,
  HostMenuPopupProvider,
  HostMenuSelectProvider,
  TauriApi,
  TauriMenuCapabilities,
  TauriMenuItemHandle,
} from '@flighthq/types/contract';

// Maps Flight's menu slots onto Tauri's `@tauri-apps/api/menu`. Tauri builds menus through async static
// factories (`Menu.new`, `MenuItem.new`, `Submenu.new`, `PredefinedMenuItem.new`), so the sync
// setApplicationMenu kicks off an async build-then-`setAsAppMenu` and optimistically returns true.
// Selection is delivered by each item's Tauri `action` callback, funneled through the listener set on the
// select slot (application menu) or resolving the popup Promise (context menu) — mirroring the electron
// seam. popup resolves null only if the async build/popup throws; otherwise it resolves on the first item
// click (Tauri exposes no menu-dismiss event).
//
export function tauriHostMenu(tauri: TauriApi): TauriMenuCapabilities {
  const state = createMenuState();
  const out = allocateEntity<TauriMenuCapabilities>();
  out.application = createMenuApplication(tauri, state);
  out.popup = createMenuPopup(tauri);
  out.select = createMenuSelect(state);
  return finishEntity(out);
}

export function tauriHostMenuApplication(tauri: TauriApi): HostMenuApplicationProvider {
  return createMenuApplication(tauri, createMenuState());
}

export function tauriHostMenuPopup(tauri: TauriApi): HostMenuPopupProvider {
  return createMenuPopup(tauri);
}

export function tauriHostMenuSelect(tauri: TauriApi): HostMenuSelectProvider {
  void tauri;
  return createMenuSelect(createMenuState());
}

interface MenuState {
  destroyed: boolean;
  selectListener: ((id: string) => void) | null;
}

function createMenuState(): MenuState {
  return { destroyed: false, selectListener: null };
}

function createMenuApplication(tauri: TauriApi, state: MenuState): HostMenuApplicationProvider {
  const menuModule = tauri.menu;
  // Tauri's menu API is entirely async — there is no synchronous path to clear the native app menu.
  // A fire-and-forget async clear races with a replacement's setApplicationMenu: the outgoing
  // destroy's empty-menu promise can settle AFTER the successor installs its real menu, overwriting
  // it with an empty one. Destroy therefore releases JS-owned state only; the native menu stays
  // until a replacement installs its own.
  const applicationProvider = allocateEntity<HostMenuApplicationProvider>();
  applicationProvider.destroy = (): void => {
    if (state.destroyed) return;
    state.destroyed = true;
  };
  applicationProvider.setApplicationMenu = (items): boolean => {
    void (async () => {
      const built = await buildItems(menuModule, items, (id) => state.selectListener?.(id));
      const menu = await menuModule.Menu.new({ items: built });
      await menu.setAsAppMenu();
    })().catch(() => {
      /* build/install failed — the previous menu stays in place */
    });
    return true;
  };
  return finishEntity(applicationProvider);
}

function createMenuPopup(tauri: TauriApi): HostMenuPopupProvider {
  const menuModule = tauri.menu;
  const popupProvider = allocateEntity<HostMenuPopupProvider>();
  popupProvider.popup = (items, x, y): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      void (async () => {
        const built = await buildItems(menuModule, items, (id) => resolve(id));
        const menu = await menuModule.Menu.new({ items: built });
        await menu.popup(new tauri.window.LogicalPosition(x, y));
      })().catch(() => resolve(null));
    });
  };
  return finishEntity(popupProvider);
}

function createMenuSelect(state: MenuState): HostMenuSelectProvider {
  const selectProvider = allocateEntity<HostMenuSelectProvider>();
  selectProvider.subscribe = (listener): (() => void) => {
    state.selectListener = listener;
    return () => {
      if (state.selectListener === listener) state.selectListener = null;
    };
  };
  return finishEntity(selectProvider);
}

// Recursively builds Tauri menu item handles from Flight templates. Separators become a predefined
// item; submenus recurse; a selectable leaf with an id gets an `action` that reports its id through
// onSelect. Every factory is async, so items are built sequentially and collected.
async function buildItems(
  menuModule: TauriApi['menu'],
  items: readonly MenuItemTemplate[],
  onSelect: (id: string) => void,
): Promise<TauriMenuItemHandle[]> {
  const built: TauriMenuItemHandle[] = [];
  for (const item of items) {
    built.push(await buildItem(menuModule, item, onSelect));
  }
  return built;
}

async function buildItem(
  menuModule: TauriApi['menu'],
  item: Readonly<MenuItemTemplate>,
  onSelect: (id: string) => void,
): Promise<TauriMenuItemHandle> {
  if (item.type === 'separator') {
    return menuModule.PredefinedMenuItem.new({ item: 'Separator' });
  }
  if (item.submenu) {
    const children = await buildItems(menuModule, item.submenu, onSelect);
    return menuModule.Submenu.new({ text: item.label, enabled: item.enabled, items: children });
  }
  const id = item.id;
  return menuModule.MenuItem.new({
    id,
    text: item.label,
    enabled: item.enabled,
    accelerator: item.accelerator,
    action: id !== undefined ? () => onSelect(id) : undefined,
  });
}
