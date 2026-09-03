import type { Entity } from './Entity';
import type { Signal } from './Signal';

// The highlight event entity: menu item hover/keyboard focus, delivered by a backend that renders the
// menu itself (today only the web DOM overlay in host-web). Standard event-capability shape —
// createMenuHighlight / attachMenuHighlight / detachMenuHighlight / disposeMenuHighlight in
// @flighthq/menu. A host whose provider hands menus to the OS omits the slot rather than exposing a
// signal that can never fire.
export interface MenuHighlight extends Entity {
  onMenuItemHighlight: Signal<(id: string) => void>;
}
