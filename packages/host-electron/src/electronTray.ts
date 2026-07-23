import type {
  MenuItemTemplate,
  TrayBackend,
  TrayEventData,
  TrayEventType,
  ElectronApi,
  ElectronMenu,
  ElectronMenuItemOptions,
  ElectronTray,
} from '@flighthq/types';

// Maps Flight's TrayBackend onto Electron's Tray module. Flight identifies trays by an opaque numeric
// id; the seam keeps an id→record map (the ElectronTray plus the title/tooltip/menu it cannot read
// back) and a single event listener. Every tray, on creation, attaches click handlers that forward a
// TrayEventData to whatever listener subscribe has installed, so trays created after subscribe still
// report events. Electron's icon is required, so a missing icon becomes ''.
export function createElectronTrayBackend(electron: ElectronApi): TrayBackend {
  const trays = new Map<number, TrayRecord>();
  let nextId = 0;
  // The single tray event listener, owned by this backend and set via subscribe.
  let eventListener: ((event: Readonly<TrayEventData>) => void) | null = null;
  const emit = (id: number, type: TrayEventType): void => {
    const record = trays.get(id);
    eventListener?.({
      altKey: false,
      bounds: record ? toBounds(record.tray) : null,
      ctrlKey: false,
      dropFiles: null,
      dropText: null,
      id,
      metaKey: false,
      position: null,
      shiftKey: false,
      type,
    });
  };
  return {
    create(options) {
      const id = nextId++;
      const tray = new electron.Tray(options.icon ?? '');
      const record: TrayRecord = { tray, title: '', tooltip: '', menu: null };
      if (options.tooltip !== undefined) {
        tray.setToolTip(options.tooltip);
        record.tooltip = options.tooltip;
      }
      if (options.title !== undefined) {
        tray.setTitle(options.title);
        record.title = options.title;
      }
      // Attach handlers now so trays created after subscribe still deliver events.
      tray.on('click', () => emit(id, 'click'));
      tray.on('right-click', () => emit(id, 'rightClick'));
      tray.on('double-click', () => emit(id, 'doubleClick'));
      trays.set(id, record);
      return id;
    },
    destroy(id) {
      const record = trays.get(id);
      if (!record) return;
      record.tray.destroy();
      trays.delete(id);
    },
    displayBalloon(id, options) {
      trays.get(id)?.tray.displayBalloon({
        icon: options.icon,
        iconType: options.iconType,
        title: options.title,
        content: options.text,
        largeIcon: options.largeIcon,
        noSound: options.noSound,
        respectQuietTime: options.respectQuietTime,
      });
    },
    removeBalloon(id) {
      trays.get(id)?.tray.removeBalloon();
    },
    getBounds(id) {
      const record = trays.get(id);
      return record ? toBounds(record.tray) : null;
    },
    getCapabilities() {
      return { balloon: true, bounds: true, clickEvents: true, dropFiles: false, pressedIcon: true, title: true };
    },
    getTitle(id) {
      return trays.get(id)?.title ?? '';
    },
    getTooltip(id) {
      return trays.get(id)?.tooltip ?? '';
    },
    isDestroyed(id) {
      const record = trays.get(id);
      return record ? record.tray.isDestroyed() : true;
    },
    listIds() {
      return [...trays.keys()];
    },
    popUpContextMenu(id, position) {
      const record = trays.get(id);
      if (!record) return;
      record.tray.popUpContextMenu(record.menu ?? undefined, position ? { x: position.x, y: position.y } : undefined);
    },
    setContextMenu(id, items) {
      const record = trays.get(id);
      if (!record) return;
      const menu = electron.Menu.buildFromTemplate(toElectronTemplate(items));
      record.menu = menu;
      record.tray.setContextMenu(menu);
    },
    setIcon(id, icon) {
      trays.get(id)?.tray.setImage(icon);
    },
    setIgnoreDoubleClickEvents(id, ignore) {
      trays.get(id)?.tray.setIgnoreDoubleClickEvents(ignore);
    },
    setPressedIcon(id, icon) {
      trays.get(id)?.tray.setPressedImage(icon);
    },
    setTemplate() {
      // Electron sets template-ness on the nativeImage, not the tray; this seam takes string icons, so
      // template marking is a no-op here (use iconTemplate at create time on a real nativeImage host).
    },
    setTitle(id, title) {
      const record = trays.get(id);
      if (!record) return;
      record.tray.setTitle(title);
      record.title = title;
    },
    setTooltip(id, tooltip) {
      const record = trays.get(id);
      if (!record) return;
      record.tray.setToolTip(tooltip);
      record.tooltip = tooltip;
    },
    subscribe(listener) {
      eventListener = listener;
      return () => {
        if (eventListener === listener) eventListener = null;
      };
    },
  };
}

function toBounds(tray: Readonly<ElectronTray>): { x: number; y: number; width: number; height: number } | null {
  try {
    const bounds = tray.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  } catch {
    return null;
  }
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

// Per-tray bookkeeping: the Electron tray plus the title/tooltip/menu Electron does not expose for read-back.
interface TrayRecord {
  tray: ElectronTray;
  title: string;
  tooltip: string;
  menu: ElectronMenu | null;
}
