import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

// Application and context menu seam. Free functions in @flighthq/menu take the operation-specific
// provider directly. Web cannot install an application menu bar, but the Web popup provider renders
// context menus in the DOM; Electron/Tauri hosts provide native OS menus. This is the platform-suite
// command pattern: a plain-data MenuItemTemplate descriptor plus flat free functions, kept symmetric
// with tray/notification/shell. The same MenuItemTemplate is consumed by tray via
// setTrayIconContextMenu, so the descriptor must not grow a menu-specific OOP surface.
export type MenuItemType = 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';

// The documented set of well-known MenuItemRole string values. MenuItemRole is an open contract, so
// custom roles are allowed; vendor-prefix them to avoid collisions with future built-in roles (for
// example, 'acme.myRole'). Backends ignore roles they do not recognize.
//
// Platform support matrix:
//   macOS-only:       hide, hideOthers, unhide, front, services, startSpeaking, stopSpeaking,
//                     toggleTabBar, selectNextTab, selectPreviousTab, mergeAllWindows,
//                     moveTabToNewWindow, recentDocuments, clearRecentDocuments, shareMenu,
//                     toggleSpellChecker
//   Windows/Linux:    quit, minimize, close
//   Electron desktop: zoom, zoomIn, zoomOut, resetZoom, reload, forceReload, toggleDevTools,
//                     toggleFullscreen
//   All platforms:    undo, redo, cut, copy, paste, delete, selectAll, about, help,
//                     pasteAndMatchStyle
//
// Whole-submenu roles (set on a submenu container to let native hosts substitute a platform menu):
//   appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu, recentDocuments, shareMenu
export const WellKnownMenuItemRole = {
  // --- Edit ---
  copy: 'copy',
  cut: 'cut',
  delete: 'delete',
  paste: 'paste',
  pasteAndMatchStyle: 'pasteAndMatchStyle',
  redo: 'redo',
  selectAll: 'selectAll',
  toggleSpellChecker: 'toggleSpellChecker',
  undo: 'undo',
  // --- App / Window ---
  about: 'about',
  close: 'close',
  front: 'front',
  hide: 'hide',
  hideOthers: 'hideOthers',
  mergeAllWindows: 'mergeAllWindows',
  minimize: 'minimize',
  moveTabToNewWindow: 'moveTabToNewWindow',
  quit: 'quit',
  selectNextTab: 'selectNextTab',
  selectPreviousTab: 'selectPreviousTab',
  toggleTabBar: 'toggleTabBar',
  unhide: 'unhide',
  zoom: 'zoom',
  // --- View ---
  forceReload: 'forceReload',
  reload: 'reload',
  resetZoom: 'resetZoom',
  toggleDevTools: 'toggleDevTools',
  toggleFullscreen: 'toggleFullscreen',
  zoomIn: 'zoomIn',
  zoomOut: 'zoomOut',
  // --- Help / Services (macOS) ---
  help: 'help',
  services: 'services',
  startSpeaking: 'startSpeaking',
  stopSpeaking: 'stopSpeaking',
  // --- Recent documents (macOS) ---
  clearRecentDocuments: 'clearRecentDocuments',
  recentDocuments: 'recentDocuments',
  // --- Whole-submenu roles (native backends substitute a platform-standard menu) ---
  appMenu: 'appMenu',
  editMenu: 'editMenu',
  fileMenu: 'fileMenu',
  helpMenu: 'helpMenu',
  shareMenu: 'shareMenu',
  viewMenu: 'viewMenu',
  windowMenu: 'windowMenu',
} as const;

export type WellKnownMenuItemRoleValue = (typeof WellKnownMenuItemRole)[keyof typeof WellKnownMenuItemRole];

// Open enum: the documented built-in roles above plus any other string, so native hosts and vendors can
// introduce their own. The `(string & {})` arm keeps editor autocomplete for the well-known values while
// still accepting any string; providers resolve an unrecognized role to a sentinel/no-op.
export type MenuItemRole = WellKnownMenuItemRoleValue | (string & {});

export interface MenuItemTemplate {
  id?: string;
  label?: string;
  type?: MenuItemType;
  role?: MenuItemRole;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  // Omitting the item entirely is distinct from `enabled: false`, which shows it greyed and
  // unselectable. Defaults to visible, so `visible: false` is the only value that changes anything.
  visible?: boolean;
  // Secondary text shown alongside the label (macOS-style). Advisory: a provider without a place to
  // put it ignores it rather than failing.
  sublabel?: string;
  // Hover/long-press help text. Advisory in the same way as `sublabel`.
  toolTip?: string;
  submenu?: MenuItemTemplate[];
}

// The menu capability is split into operation-specific provider shapes, and they are deliberately NOT
// merged. Coverage differs — every provider can pop up a context menu, only Electron/Tauri own a native
// application menu bar or deliver menu-bar selections — but coverage alone is not the reason. The
// shapes are incompatible: `application` is a fire-and-forget command returning success, `select` is an
// event subscription returning an unsubscribe, and `popup` is a request/response resolving to a chosen
// id. Merging them would force a provider to present members it cannot honour, which is precisely how
// the old combined shape let the Web implementation claim four operations while implementing one.
//
// `destroy` appears on the application slot ALONE. Only that provider acquires a whole-provider
// resource — the installed native menu — which outlives any single call: Electron clears the app menu
// and Tauri releases its JS-owned state. popup is command-only, and highlight/select hand back a
// per-subscription unsubscribe that already owns everything they acquired, so a `destroy` on those
// three would be a teardown obligation no provider implements.

// Installs the application menu bar. Returns false when the install did not take effect. Only hosts with
// a real native menu bar expose this slot at all; a host without one omits it rather than returning false.
export interface HostAppMenuCapability {
  destroy?(): void;
  setAppMenu(items: readonly MenuItemTemplate[]): boolean;
}

// Delivers item-highlight notifications (hover / keyboard focus) by item id. Only a provider that
// renders the menu itself can observe highlight, which today is the web DOM overlay — native hosts hand
// the menu to the OS and never see it. `subscribe` returns the unsubscribe for THAT subscription only.
export interface HostMenuHighlightCapability {
  subscribe(listener: (id: string) => void): () => void;
}

// Pops up a context menu at (x, y) and resolves the chosen item id, or null when dismissed.
export interface HostMenuPopupCapability {
  popup(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null>;
}

// Delivers application menu-bar selections by item id. `subscribe` returns the unsubscribe for THAT
// subscription only.
export interface HostMenuSelectCapability {
  subscribe(listener: (id: string) => void): () => void;
}

export interface HostMenuCapabilities {
  readonly app?: HostAppMenuCapability;
  readonly highlight?: HostMenuHighlightCapability;
  readonly popup?: HostMenuPopupCapability;
  readonly select?: HostMenuSelectCapability;
}

export type ElectronMenuCapabilities = Required<Pick<HostMenuCapabilities, 'app' | 'popup' | 'select'>>;

export type TauriMenuCapabilities = Required<Pick<HostMenuCapabilities, 'app' | 'popup' | 'select'>>;

// The highlight event entity: menu item hover/keyboard focus, delivered by a backend that renders the
// menu itself (today only the web DOM overlay in host-web). Standard event-capability shape —
// createMenuHighlight / attachMenuHighlight / detachMenuHighlight / disposeMenuHighlight in
// @flighthq/menu. A host whose provider hands menus to the OS omits the slot rather than exposing a
// signal that can never fire.
export interface MenuHighlight extends EntityRaw {
  readonly [EntityRuntimeKey]: EntityRuntime | undefined;
  onMenuItemHighlight: Signal<string>;
}

// The select event entity: application menu-bar selections, delivered by a backend (Electron/Tauri).
// Standard event-capability shape — createMenuSelect / attachMenuSelect / detachMenuSelect /
// disposeMenuSelect in @flighthq/menu. Attach subscribes through the host's `menu.select` slot; detach
// runs that subscription's own unsubscribe, and dispose owns listener teardown.
export interface MenuSelect extends EntityRaw {
  readonly [EntityRuntimeKey]: EntityRuntime | undefined;
  onMenuItemSelect: Signal<string>;
}

/**
 * Core context-menu dispatcher signals. These stay a package-level opt-in group rather than Host event
 * slots because the CORE dispatcher emits them around the popup call — no backend emits them, so under
 * R18 they are not a host capability. Opt in via `enableMenuSignals()` from `@flighthq/menu`.
 *
 * Item selection and item highlight are NOT here: after the DOM overlay moved to host-web, both are
 * emitted by a backend, so they became Host event slots (`menu.select`, `menu.highlight`) with their own
 * signal entities.
 */
export interface MenuSignals extends EntityRaw {
  readonly [EntityRuntimeKey]: EntityRuntime | undefined;
  /** Fires when a context menu is dismissed (either by selection or outside-click). */
  onContextMenuClose: Signal<void>;
  /** Fires when a context menu is opened via showContextMenu. */
  onContextMenuOpen: Signal<void>;
}
