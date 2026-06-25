import type { Signal } from './Signal';
/**
 * Optional signal group for menu lifecycle events. Opt-in via `enableMenuSignals()` from
 * `@flighthq/menu` — the signals are null until that function is called, so the group is
 * tree-shaken when unused. All signals fire synchronously within the calling thread.
 */
export interface MenuSignals {
  /** Fires when a context menu is opened via showContextMenu. */
  onContextMenuOpen: Signal<() => void>;
  /** Fires when a context menu is dismissed (either by selection or outside-click). */
  onContextMenuClose: Signal<() => void>;
  /** Fires when any menu item is highlighted (hovered/keyboard-focused). Payload is the item id. */
  onMenuItemHighlight: Signal<(id: string) => void>;
  /** Fires when a menu item is selected; same id as onMenuSelect but as a multi-listener signal. */
  onMenuItemSelect: Signal<(id: string) => void>;
}
