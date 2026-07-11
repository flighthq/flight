import type { MenuItemTemplate, TrayBackend, TrayEventData, TrayEventType } from '@flighthq/types';

import type { TauriApi, TauriMenuItemHandle, TauriTrayIcon, TauriTrayIconEvent } from './tauriModule';

// Maps Flight's TrayBackend onto Tauri's `@tauri-apps/api/tray`. Tauri's `TrayIcon.new` is async, while
// TrayBackend.create is synchronous and must return a numeric id now — so create allocates the id
// immediately, records it, and adopts the resolved `TrayIcon` handle when the async build settles;
// method calls before the handle lands (setIcon/setTitle/…) queue nothing and simply no-op on the not-
// yet-ready record, matching the "no-op when absent" pattern. Click/double-click are delivered through
// the Tauri tray `action` callback and forwarded as TrayEventData to the single subscribed listener.
// Tauri exposes no Windows balloon, no tray bounds, and no template/pressed-icon distinction here, so
// those methods report the contract sentinels (null / no-op). Icons cross as string paths.
export function createTauriTrayBackend(tauri: TauriApi): TrayBackend {
  const trayModule = tauri.tray;
  const menuModule = tauri.menu;
  const trays = new Map<number, TrayRecord>();
  let nextId = 0;
  // The single tray event listener, owned by this backend and set via subscribe.
  let eventListener: ((event: Readonly<TrayEventData>) => void) | null = null;
  const emit = (id: number, type: TrayEventType): void => {
    eventListener?.({
      altKey: false,
      bounds: null,
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
      const record: TrayRecord = { icon: null, title: options.title ?? '', tooltip: options.tooltip ?? '' };
      trays.set(id, record);
      trayModule.TrayIcon.new({
        icon: options.icon,
        title: options.title,
        tooltip: options.tooltip,
        action: (event) => {
          const type = toTrayEventType(event);
          if (type !== null) emit(id, type);
        },
      })
        .then((icon) => {
          record.icon = icon;
        })
        .catch(() => {
          /* tray creation failed — the record stays iconless and its methods no-op */
        });
      return id;
    },
    destroy(id) {
      const record = trays.get(id);
      if (!record) return;
      record.icon?.close().catch(() => {});
      trays.delete(id);
    },
    displayBalloon() {
      // Tauri has no Windows balloon API; no-op.
    },
    removeBalloon() {
      // No balloon to remove.
    },
    getBounds() {
      // Tauri does not report tray icon bounds; null sentinel.
      return null;
    },
    getCapabilities() {
      return { balloon: false, bounds: false, clickEvents: true, dropFiles: false, pressedIcon: false, title: true };
    },
    getTitle(id) {
      return trays.get(id)?.title ?? '';
    },
    getTooltip(id) {
      return trays.get(id)?.tooltip ?? '';
    },
    isDestroyed(id) {
      return !trays.has(id);
    },
    listIds() {
      return [...trays.keys()];
    },
    popUpContextMenu(id) {
      // Tauri shows the tray menu on click via setMenu; it has no imperative popup here. No-op.
      void id;
    },
    setContextMenu(id, items) {
      const record = trays.get(id);
      if (!record) return;
      void (async () => {
        const built = await buildTrayItems(menuModule, items);
        const menu = await menuModule.Menu.new({ items: built });
        await record.icon?.setMenu(menu);
      })().catch(() => {});
    },
    setIcon(id, icon) {
      trays
        .get(id)
        ?.icon?.setIcon(icon)
        .catch(() => {});
    },
    setIgnoreDoubleClickEvents() {
      // Tauri has no double-click-ignore toggle; no-op.
    },
    setPressedIcon() {
      // Tauri has no distinct pressed-state icon; no-op.
    },
    setTemplate() {
      // Template-ness is set on the icon at creation in Tauri, not toggled here; no-op.
    },
    setTitle(id, title) {
      const record = trays.get(id);
      if (!record) return;
      record.title = title;
      record.icon?.setTitle(title).catch(() => {});
    },
    setTooltip(id, tooltip) {
      const record = trays.get(id);
      if (!record) return;
      record.tooltip = tooltip;
      record.icon?.setTooltip(tooltip).catch(() => {});
    },
    subscribe(listener) {
      eventListener = listener;
      return () => {
        if (eventListener === listener) eventListener = null;
      };
    },
  };
}

// Maps a Tauri tray pointer event onto Flight's TrayEventType, or null for events with no Flight
// equivalent (enter/leave/move). A right-button click reports 'rightClick'.
function toTrayEventType(event: Readonly<TauriTrayIconEvent>): TrayEventType | null {
  if (event.type === 'DoubleClick') return 'doubleClick';
  if (event.type === 'Click') return event.button === 'Right' ? 'rightClick' : 'click';
  return null;
}

// Builds Tauri tray-menu item handles from Flight templates. Tray-menu selection is delivered through
// the menu backend's listener, so these items carry no action callback (mirroring the electron seam).
async function buildTrayItems(
  menuModule: TauriApi['menu'],
  items: readonly MenuItemTemplate[],
): Promise<TauriMenuItemHandle[]> {
  const built: TauriMenuItemHandle[] = [];
  for (const item of items) {
    if (item.type === 'separator') {
      built.push(await menuModule.PredefinedMenuItem.new({ item: 'Separator' }));
    } else if (item.submenu) {
      built.push(
        await menuModule.Submenu.new({
          text: item.label,
          enabled: item.enabled,
          items: await buildTrayItems(menuModule, item.submenu),
        }),
      );
    } else {
      built.push(await menuModule.MenuItem.new({ id: item.id, text: item.label, enabled: item.enabled }));
    }
  }
  return built;
}

// Per-tray bookkeeping: the resolved Tauri tray icon (null until the async build lands) plus the
// title/tooltip Tauri does not expose for read-back.
interface TrayRecord {
  icon: TauriTrayIcon | null;
  title: string;
  tooltip: string;
}
