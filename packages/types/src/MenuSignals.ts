import type { Signal } from './Signal';

/**
 * Core context-menu dispatcher signals. These stay a package-level opt-in group rather than Host event
 * slots because the CORE dispatcher emits them around the popup call — no backend emits them, so under
 * R18 they are not a host capability. Opt in via `enableMenuSignals()` from `@flighthq/menu`.
 *
 * Item selection and item highlight are NOT here: after the DOM overlay moved to host-web, both are
 * emitted by a backend, so they became Host event slots (`menu.select`, `menu.highlight`) with their own
 * signal entities.
 */
export interface MenuSignals {
  /** Fires when a context menu is dismissed (either by selection or outside-click). */
  onContextMenuClose: Signal<() => void>;
  /** Fires when a context menu is opened via showContextMenu. */
  onContextMenuOpen: Signal<() => void>;
}
