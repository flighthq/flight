import { createEntity } from '@flighthq/entity/contract';
import type {
  MenuApplicationBackend,
  MenuItemTemplate,
  MenuPopupBackend,
  MenuSelectBackend,
  TauriApi,
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
// Built together because `application` and `select` share the listener closure; kept as separate slots
// because their shapes are incompatible.
export function createTauriMenuBackends(tauri: TauriApi): {
  application: MenuApplicationBackend;
  popup: MenuPopupBackend;
  select: MenuSelectBackend;
} {
  const menuModule = tauri.menu;
  let selectListener: ((id: string) => void) | null = null;
  let destroyed = false;
  return {
    application: createEntity<MenuApplicationBackend>({
      // Tauri's menu API is entirely async — there is no synchronous path to clear the native app menu.
      // A fire-and-forget async clear races with a replacement's setApplicationMenu: the outgoing
      // destroy's empty-menu promise can settle AFTER the successor installs its real menu, overwriting
      // it with an empty one. Destroy therefore releases JS-owned state only; the native menu stays
      // until a replacement installs its own.
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
      },
      setApplicationMenu(items): boolean {
        void (async () => {
          const built = await buildItems(menuModule, items, (id) => selectListener?.(id));
          const menu = await menuModule.Menu.new({ items: built });
          await menu.setAsAppMenu();
        })().catch(() => {
          /* build/install failed — the previous menu stays in place */
        });
        return true;
      },
    }),
    popup: createEntity<MenuPopupBackend>({
      popup(items, x, y): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
          void (async () => {
            const built = await buildItems(menuModule, items, (id) => resolve(id));
            const menu = await menuModule.Menu.new({ items: built });
            await menu.popup(new tauri.window.LogicalPosition(x, y));
          })().catch(() => resolve(null));
        });
      },
    }),
    select: createEntity<MenuSelectBackend>({
      subscribe(listener): () => void {
        selectListener = listener;
        return () => {
          if (selectListener === listener) selectListener = null;
        };
      },
    }),
  };
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
