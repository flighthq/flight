import type { WellKnownMenuItemRoleValue } from './WellKnownMenuItemRole';

// Native application and context menu seam. Free functions in @flighthq/menu delegate to the active
// MenuBackend (web default or a native host's). Web has no native menu bar or OS context menu, so the
// web backend returns false / null sentinels rather than throwing — native menus require a native host
// (Electron/Tauri); a real web context-menu renderer is out of scope for the MVP. This is the
// platform-suite command pattern: a plain-data MenuItemTemplate descriptor plus flat free functions,
// kept symmetric with tray/notification/shell. The same MenuItemTemplate is consumed by tray via
// setTrayContextMenu, so the descriptor must not grow a menu-specific OOP surface.
export type MenuItemType = 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';

// Open enum: the documented built-in roles (WellKnownMenuItemRole) plus any other string, so native
// hosts and vendors can introduce their own (vendor-prefix custom roles to avoid collisions). The
// `(string & {})` arm keeps editor autocomplete for the well-known values while still accepting any
// string; backends resolve an unrecognized role to a sentinel/no-op. The full role list and platform
// support matrix live in WellKnownMenuItemRole.
export type MenuItemRole = WellKnownMenuItemRoleValue | (string & {});

export interface MenuItemTemplate {
  id?: string;
  label?: string;
  type?: MenuItemType;
  role?: MenuItemRole;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: MenuItemTemplate[];
}

// The backend seam realized by the web default and by native hosts (e.g. host-electron). This is the
// honored shape — a method no real host implements would be a phantom. Application-menu installation
// returns a boolean (false when the host has no native menu bar, e.g. web); context-menu popups
// resolve to the selected item id, or null when dismissed; selections are delivered by id.
export interface MenuBackend {
  setApplicationMenu(items: readonly MenuItemTemplate[]): boolean;
  popupContextMenu(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null>;
  subscribeSelect(listener: (id: string) => void): () => void;
}
