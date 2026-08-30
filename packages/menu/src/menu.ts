import { createEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  HasMenuApplication,
  HasMenuHighlight,
  HasMenuPopup,
  HasMenuSelect,
  MenuHighlight,
  MenuItemTemplate,
  MenuSelect,
  MenuSignals,
} from '@flighthq/types/contract';

// Starts delivering highlight notifications from the host's provider into `highlight`. Re-attaching
// detaches first, so one entity never holds two live subscriptions.
//
// The unsubscribe is ORIGIN-PINNED: it is stored beside the entity that opened it, so detach ends
// exactly the subscription this attach created. Under the old ambient model a rebind could leave an
// earlier subscription live against a replaced backend with nothing holding its unsubscribe.
export function attachMenuHighlight(host: HasMenuHighlight, highlight: MenuHighlight): void {
  detachMenuHighlight(highlight);
  const unsubscribe = host.menu.highlight.subscribe((id) => emitSignal(highlight.onMenuItemHighlight, id));
  _highlightUnsubscribe.set(highlight, unsubscribe);
}

// Starts delivering application menu-bar selections from the host's provider into `select`. Same
// origin-pinned unsubscribe contract as attachMenuHighlight.
export function attachMenuSelect(host: HasMenuSelect, select: MenuSelect): void {
  detachMenuSelect(select);
  const unsubscribe = host.menu.select.subscribe((id) => emitSignal(select.onMenuItemSelect, id));
  _selectUnsubscribe.set(select, unsubscribe);
}

// Deep-clones a MenuItemTemplate tree. The returned tree has the same shape and values. Safe to call
// with a template carrying a submenu — children are cloned recursively.
export function cloneMenuTemplate(template: Readonly<MenuItemTemplate>): MenuItemTemplate {
  const clone: MenuItemTemplate = { ...template };
  if (template.submenu !== undefined) {
    clone.submenu = template.submenu.map(cloneMenuTemplate);
  }
  return clone;
}

// Allocates a MenuHighlight event entity with an inert signal; call attachMenuHighlight to start
// delivery. Entity-composed, like every identity-bearing SDK object.
export function createMenuHighlight(): MenuHighlight {
  return createEntity({ onMenuItemHighlight: createSignal() });
}

// Builds a menu item template, filling defaults (type 'normal', enabled true). Recursively normalizes
// any submenu children through the same default-fill, so every item in the tree has canonical defaults
// regardless of nesting depth.
export function createMenuItemTemplate(template?: Readonly<Partial<MenuItemTemplate>>): MenuItemTemplate {
  const item: MenuItemTemplate = {
    type: 'normal',
    enabled: true,
    ...template,
  };
  if (item.submenu !== undefined) {
    item.submenu = item.submenu.map((child) => createMenuItemTemplate(child));
  }
  return item;
}

// Allocates a MenuSelect event entity with an inert signal; call attachMenuSelect to start delivery.
export function createMenuSelect(): MenuSelect {
  return createEntity({ onMenuItemSelect: createSignal() });
}

// Stops delivery without discarding the entity: runs this entity's own unsubscribe, if it has one.
// Safe to call when never attached. Does NOT touch the provider — backend teardown is `destroy` on the
// slot, a separate host/provider lifecycle concern.
export function detachMenuHighlight(highlight: MenuHighlight): void {
  _highlightUnsubscribe.get(highlight)?.();
  _highlightUnsubscribe.delete(highlight);
}

export function detachMenuSelect(select: MenuSelect): void {
  _selectUnsubscribe.get(select)?.();
  _selectUnsubscribe.delete(select);
}

// Detaches and then clears the entity's listeners, so the entity becomes GC-eligible. Teardown of the
// PROVIDER is not performed here; that is `destroy` on the host's slot.
export function disposeMenuHighlight(highlight: MenuHighlight): void {
  detachMenuHighlight(highlight);
  clearSignal(highlight.onMenuItemHighlight);
}

export function disposeMenuSelect(select: MenuSelect): void {
  detachMenuSelect(select);
  clearSignal(select.onMenuItemSelect);
}

// Activates the core context-menu dispatcher signals and returns the group. These are NOT host
// capabilities: the dispatcher below emits them around the popup call, so no backend can deliver them.
// The module-level identity/enable state here is package state, not ambient capability resolution —
// nothing about which provider serves a call is decided by it.
export function enableMenuSignals(): MenuSignals {
  _menuSignals ??= { onContextMenuClose: createSignal(), onContextMenuOpen: createSignal() };
  return _menuSignals;
}

export function getMenuSignals(): Readonly<MenuSignals> | null {
  return _menuSignals;
}

// Installs the application menu bar through the host's provider. Returns false when the install did
// not take effect. A host without a native menu bar omits the slot entirely, so this cannot be reached
// with a stub that always answers false.
export function setApplicationMenu(host: HasMenuApplication, items: readonly MenuItemTemplate[]): boolean {
  return host.menu.application.setApplicationMenu(items);
}

// Pops up a context menu through the host's provider and resolves the chosen item id, or null when
// dismissed. Emits the core open/close dispatcher signals around the call when they are enabled.
export function showContextMenu(
  host: HasMenuPopup,
  items: readonly MenuItemTemplate[],
  x: number,
  y: number,
): Promise<string | null> {
  const signals = _menuSignals;
  if (signals !== null) emitSignal(signals.onContextMenuOpen);
  const promise = host.menu.popup.popup(items, x, y);
  if (signals !== null) void promise.then(() => emitSignal(signals.onContextMenuClose));
  return promise;
}

// Validates a MenuItemTemplate tree for consistency. Returns null on success, or a string describing
// the first violation found. Does not throw — returns a sentinel for expected failures. Throws only
// for cyclic submenu references (programmer error).
export function validateMenuItemTemplate(template: Readonly<MenuItemTemplate>): string | null {
  return _validateItem(template, new Set());
}

function _validateItem(item: Readonly<MenuItemTemplate>, seen: Set<Readonly<MenuItemTemplate>>): string | null {
  if (seen.has(item)) {
    throw new Error('validateMenuItemTemplate: cyclic submenu reference detected');
  }
  if (item.type === 'separator') {
    if (item.label !== undefined && item.label !== '') {
      return `separator item has a label: "${item.label}" (separators should not have labels)`;
    }
    if (item.accelerator !== undefined) {
      return `separator item has an accelerator: "${item.accelerator}"`;
    }
    if (item.submenu !== undefined) {
      return 'separator item has a submenu';
    }
    return null;
  }
  if (item.type !== 'submenu' && item.submenu !== undefined && item.submenu.length > 0) {
    return `item type "${item.type ?? 'normal'}" has a submenu (only type "submenu" should carry children)`;
  }
  // `checked` only means something on the two toggle types. Setting it elsewhere is the mistake that
  // renders silently: the web backend draws the checkmark from `checked` alone, so a normal item with
  // checked: true grows a tick it can never clear, and native backends typically drop it instead —
  // same descriptor, two different wrong results, which is exactly what validation is for.
  if (item.checked !== undefined && item.type !== 'checkbox' && item.type !== 'radio') {
    return `item type "${item.type ?? 'normal'}" has "checked" (only "checkbox" and "radio" items are checkable)`;
  }
  if (item.submenu !== undefined) {
    const groupError = _validateRadioGroups(item.submenu);
    if (groupError !== null) return groupError;
    seen.add(item);
    for (const child of item.submenu) {
      const err = _validateItem(child, seen);
      if (err !== null) return err;
    }
    seen.delete(item);
  }
  return null;
}

// A radio group is a run of adjacent radio items — any other item type, including a separator, starts
// a new one. Exactly one member of a run may be checked; two checked members describe a state the
// widget cannot represent, and each backend picks a different winner. Checked on a non-radio item is
// caught per-item above; this is the rule that only exists across siblings, which is why it runs where
// the child list is known rather than inside the per-item walk.
function _validateRadioGroups(items: readonly Readonly<MenuItemTemplate>[]): string | null {
  let checkedInRun = 0;
  for (const item of items) {
    if (item.type !== 'radio') {
      checkedInRun = 0;
      continue;
    }
    if (item.checked === true) checkedInRun++;
    if (checkedInRun > 1) {
      return `radio group has ${checkedInRun} checked items (a radio group may have at most one)`;
    }
  }
  return null;
}

let _menuSignals: MenuSignals | null = null;

// Origin-pinned subscription bookkeeping: each entity's own unsubscribe, held beside the entity rather
// than in a shared slot, so detaching one never ends another's subscription.
const _highlightUnsubscribe = new WeakMap<MenuHighlight, () => void>();
const _selectUnsubscribe = new WeakMap<MenuSelect, () => void>();
