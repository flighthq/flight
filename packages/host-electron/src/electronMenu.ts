import type { MenuBackend, MenuItemTemplate, ElectronApi, ElectronMenuItemOptions } from '@flighthq/types';

// Maps Flight's MenuBackend onto Electron's Menu module. Flight menu items are plain templates with a
// stable `id`; Electron delivers selection through per-item `click` callbacks, so the seam funnels
// those clicks back through an explicit onSelect. The application menu's clicks go to the listener
// registered via subscribeSelect; context-menu clicks resolve the popup Promise with the clicked id.
export function createElectronMenuBackend(electron: ElectronApi): MenuBackend {
  // The single application-menu select listener, owned by this backend. setApplicationMenu wires it
  // as onSelect; subscribeSelect sets it and returns an unsubscribe that clears it.
  let selectListener: ((id: string) => void) | null = null;
  return {
    setApplicationMenu(items) {
      electron.Menu.setApplicationMenu(
        electron.Menu.buildFromTemplate(toElectronTemplate(items, (id) => selectListener?.(id))),
      );
      return true;
    },
    popupContextMenu(items, x, y) {
      // The Electron seam exposes no menu close event, so the Promise resolves on the first item
      // click and never resolves to null from a dismissal — callers treat a non-resolving Promise as
      // "still open". We resolve null only if popup throws.
      return new Promise<string | null>((resolve) => {
        const menu = electron.Menu.buildFromTemplate(toElectronTemplate(items, (id) => resolve(id)));
        try {
          menu.popup({ x, y });
        } catch {
          resolve(null);
        }
      });
    },
    subscribeSelect(listener) {
      selectListener = listener;
      return () => {
        if (selectListener === listener) selectListener = null;
      };
    },
  };
}

// Recursively maps Flight menu templates to Electron menu options. A selectable leaf with an id gets a
// `click` that reports its id through onSelect; submenus recurse with the same onSelect.
function toElectronTemplate(
  items: readonly MenuItemTemplate[],
  onSelect?: (id: string) => void,
): ElectronMenuItemOptions[] {
  return items.map((item) => {
    const options: ElectronMenuItemOptions = {
      id: item.id,
      label: item.label,
      type: item.type,
      role: item.role,
      accelerator: item.accelerator,
      enabled: item.enabled,
      checked: item.checked,
    };
    if (item.submenu) {
      options.submenu = toElectronTemplate(item.submenu, onSelect);
    } else if (onSelect && item.id !== undefined) {
      options.click = () => onSelect(item.id!);
    }
    return options;
  });
}
