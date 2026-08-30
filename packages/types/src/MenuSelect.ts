import type { Signal } from './Signal';

// The select event entity: application menu-bar selections, delivered by a backend (Electron/Tauri).
// Standard event-capability shape — createMenuSelect / attachMenuSelect / detachMenuSelect /
// disposeMenuSelect in @flighthq/menu. Attach subscribes through the host's `menu.select` slot; detach
// runs that subscription's own unsubscribe, and dispose owns listener teardown.
export interface MenuSelect {
  onMenuItemSelect: Signal<(id: string) => void>;
}
