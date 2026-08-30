import type { WellKnownMenuItemRoleValue } from './WellKnownMenuItemRole';

// Application and context menu seam. Free functions in @flighthq/menu delegate to the active
// MenuBackend (web default or a native host's). Web cannot install an application menu bar, but the
// web backend renders context menus in the DOM; Electron/Tauri hosts can replace it with native OS
// menus. This is the platform-suite command pattern: a plain-data MenuItemTemplate descriptor plus
// flat free functions, kept symmetric with tray/notification/shell. The same MenuItemTemplate is
// consumed by tray via setTrayIconContextMenu, so the descriptor must not grow a menu-specific OOP
// surface.
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
  // Omitting the item entirely, distinct from `enabled: false` which shows it greyed and unselectable.
  // Defaults to visible, so `visible: false` is the only value that changes anything.
  visible?: boolean;
  // Secondary text shown alongside the label (macOS-style). Advisory: a backend without a place to put
  // it ignores it rather than failing.
  sublabel?: string;
  // Hover/long-press help text. Advisory in the same way as `sublabel`.
  toolTip?: string;
  submenu?: MenuItemTemplate[];
}

// The menu capability is split into three backend shapes, one per slot, and they are deliberately NOT
// merged. Coverage differs — every provider can pop up a context menu, only Electron/Tauri own a native
// application menu bar or deliver menu-bar selections — but coverage alone is not the reason. The shapes
// are incompatible: `application` is a fire-and-forget command returning success, `select` is an event
// subscription returning an unsubscribe, and `popup` is a request/response resolving to a chosen id.
// Merging them would force a provider to present members it cannot honour, which is precisely how the
// old single MenuBackend let the web backend claim four operations while implementing one.
//
// `destroy` appears on the application slot ALONE. Only that provider acquires a whole-provider
// resource — the installed native menu — which outlives any single call: Electron clears the app menu
// and Tauri releases its JS-owned state. popup is command-only, and highlight/select hand back a
// per-subscription unsubscribe that already owns everything they acquired, so a `destroy` on those
// three would be a teardown obligation no provider implements.

// Installs the application menu bar. Returns false when the install did not take effect. Only hosts with
// a real native menu bar expose this slot at all; a host without one omits it rather than returning false.
export interface MenuApplicationBackend {
  destroy?(): void;
  setApplicationMenu(items: readonly MenuItemTemplate[]): boolean;
}

// Delivers item-highlight notifications (hover / keyboard focus) by item id. Only a provider that
// renders the menu itself can observe highlight, which today is the web DOM overlay — native hosts hand
// the menu to the OS and never see it. `subscribe` returns the unsubscribe for THAT subscription only.
export interface MenuHighlightBackend {
  subscribe(listener: (id: string) => void): () => void;
}

// Pops up a context menu at (x, y) and resolves the chosen item id, or null when dismissed.
export interface MenuPopupBackend {
  popup(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null>;
}

// Delivers application menu-bar selections by item id. `subscribe` returns the unsubscribe for THAT
// subscription only.
export interface MenuSelectBackend {
  subscribe(listener: (id: string) => void): () => void;
}
