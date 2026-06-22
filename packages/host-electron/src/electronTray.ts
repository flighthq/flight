import type { MenuItemTemplate, TrayBackend, TrayEventType } from '@flighthq/types';

import type { ElectronApi, ElectronMenuItemOptions, ElectronTray } from './electronModule';

// Maps Flight's TrayBackend onto Electron's Tray module. Flight identifies trays by an opaque numeric
// id; the seam keeps an id→ElectronTray map and a single click listener. Every tray, on creation,
// attaches click handlers that forward to whatever listener subscribe has installed, so trays created
// after subscribe still report events. Electron's icon is required, so a missing icon becomes ''.
export function createElectronTrayBackend(electron: ElectronApi): TrayBackend {
  const trays = new Map<number, ElectronTray>();
  let nextId = 0;
  // The single tray event listener, owned by this backend and set via subscribe.
  let eventListener: ((id: number, event: TrayEventType) => void) | null = null;
  return {
    create(options) {
      const id = nextId++;
      const tray = new electron.Tray(options.icon ?? '');
      if (options.tooltip !== undefined) tray.setToolTip(options.tooltip);
      if (options.title !== undefined) tray.setTitle(options.title);
      // Attach handlers now so trays created after subscribe still deliver events.
      tray.on('click', () => eventListener?.(id, 'click'));
      tray.on('right-click', () => eventListener?.(id, 'rightClick'));
      tray.on('double-click', () => eventListener?.(id, 'doubleClick'));
      trays.set(id, tray);
      return id;
    },
    destroy(id) {
      const tray = trays.get(id);
      if (!tray) return;
      tray.destroy();
      trays.delete(id);
    },
    setTooltip(id, tooltip) {
      trays.get(id)?.setToolTip(tooltip);
    },
    setTitle(id, title) {
      trays.get(id)?.setTitle(title);
    },
    setContextMenu(id, items) {
      const tray = trays.get(id);
      if (!tray) return;
      tray.setContextMenu(electron.Menu.buildFromTemplate(toElectronTemplate(items)));
    },
    subscribe(listener) {
      eventListener = listener;
      return () => {
        if (eventListener === listener) eventListener = null;
      };
    },
  };
}

// Recursively maps Flight menu templates to Electron menu options for a tray context menu. Tray menus
// carry no select callback in this seam — selection is reported through the menu backend's listener.
function toElectronTemplate(items: readonly MenuItemTemplate[]): ElectronMenuItemOptions[] {
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
    if (item.submenu) options.submenu = toElectronTemplate(item.submenu);
    return options;
  });
}
