import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { BackendExplanation } from '@flighthq/types/contract';
import type { MenuBackend, MenuItemTemplate, MenuSignals } from '@flighthq/types/contract';

// Deep-clones a MenuItemTemplate tree. The returned tree has the same shape and values. Safe to call
// with a template carrying a submenu — children are cloned recursively.
export function cloneMenuTemplate(template: Readonly<MenuItemTemplate>): MenuItemTemplate {
  const clone: MenuItemTemplate = { ...template };
  if (template.submenu !== undefined) {
    clone.submenu = template.submenu.map(cloneMenuTemplate);
  }
  return clone;
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

// Activates the optional MenuSignals group and returns it. Calling this is when the cost is assumed.
// The returned object is shared for the lifetime of the package; calling enableMenuSignals multiple
// times returns the same instance. Connect slots via connectSignal from @flighthq/signals.
export function enableMenuSignals(): MenuSignals {
  if (_menuSignals === null) {
    _menuSignals = {
      onContextMenuClose: createSignal(),
      onContextMenuOpen: createSignal(),
      onMenuItemHighlight: createSignal(),
      onMenuItemSelect: createSignal(),
    };
  }
  return _menuSignals;
}

export function explainMenuBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// Returns the active backend following the precedence chain: custom > host > sentinel.
export function getMenuBackend(): MenuBackend {
  return _custom ?? _host ?? _sentinel;
}

// Returns the active MenuSignals group, or null if enableMenuSignals has not been called.
export function getMenuSignals(): Readonly<MenuSignals> | null {
  return _menuSignals;
}

export function installMenuHostBackend(backend: MenuBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeMenuHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Subscribes to application menu item selections by item id. Returns an unsubscribe function. On web
// this never fires (no native app menu bar). Selections are also fanned out to onMenuItemSelect when
// the MenuSignals group is enabled.
export function onMenuSelect(listener: (id: string) => void): () => void {
  return getMenuBackend().subscribeSelect((id) => {
    listener(id);
    if (_menuSignals !== null) emitSignal(_menuSignals.onMenuItemSelect, id);
  });
}

export function resetMenuBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Installs the application menu bar. Returns true on success, or false when the host lacks a native
// menu bar (e.g. web).
export function setApplicationMenu(items: readonly MenuItemTemplate[]): boolean {
  return getMenuBackend().setApplicationMenu(items);
}

// Sets a custom menu backend; pass null to clear and fall back to the host or sentinel.
export function setMenuBackend(backend: MenuBackend | null): void {
  if (_custom === backend) return;
  const previous = [_custom] as const;
  _custom = backend;
  releaseMenuBackends(previous);
}

// Pops up a context menu at (x, y) and resolves the clicked item id, or null when dismissed. On web,
// renders a positioned DOM popup (separators, enabled/checked rendering, dismiss on outside-click /
// Escape). On a native host, delegates to the OS context menu.
export function showContextMenu(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null> {
  if (_menuSignals !== null) emitSignal(_menuSignals.onContextMenuOpen);
  const promise = getMenuBackend().popupContextMenu(items, x, y);
  if (_menuSignals !== null) {
    const signals = _menuSignals;
    void promise.then(() => emitSignal(signals.onContextMenuClose));
  }
  return promise;
}

// Renders a minimal DOM popup for showContextMenu in a browser environment. Returns the clicked item
// id or null when the menu is dismissed without a selection. Keyboard support is ArrowUp/ArrowDown
// within one menu level, plus Enter/Space to select and Escape to dismiss. Submenus open on hover
// only: there is no ArrowRight/ArrowLeft traversal, so a submenu's rows are unreachable by keyboard,
// and Enter on a submenu parent currently resolves the popup with that parent's id rather than
// opening it. Both are recorded as open work in the package assessment rather than fixed here.
// Exported so the host-web enabler can delegate to this DOM rendering implementation.
export function showWebContextMenu(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;';
    const menu = buildWebMenuElement(items, (id) => close(id));
    function clampMenu(el: HTMLElement, anchorX: number, anchorY: number): void {
      el.style.left = `${anchorX}px`;
      el.style.top = `${anchorY}px`;
      const rect = el.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
      if (rect.right > vw) el.style.left = `${Math.max(0, anchorX - rect.width)}px`;
      if (rect.bottom > vh) el.style.top = `${Math.max(0, anchorY - rect.height)}px`;
    }
    function close(selectedId: string | null): void {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      menu.remove();
      resolve(selectedId);
    }
    // Keyboard navigation. Scoped to this menu's own rows: a submenu is built as a nested <ul> inside
    // its parent <li>, so an unscoped descendant query also matches the rows of every collapsed
    // submenu. Those rows are display:none, which made arrow-key travel stop on invisible entries —
    // the highlight vanished for a keypress — and let Enter resolve the popup with the id of an item
    // the user could not see.
    const focusableItems = menu.querySelectorAll<HTMLElement>(':scope > li[data-enabled="true"]');
    let focusIndex = -1;
    function moveFocus(delta: number): void {
      const items = Array.from(focusableItems);
      if (items.length === 0) return;
      // From the initial no-selection state the wrap has to be spelled out: -1 is a sentinel, not a
      // position, and running it through the modulo lands ArrowUp on the second-to-last row rather
      // than the last one. Down enters at the top, up enters at the bottom.
      focusIndex =
        focusIndex === -1 ? (delta < 0 ? items.length - 1 : 0) : (focusIndex + delta + items.length) % items.length;
      items.forEach((el, i) => {
        if (i === focusIndex) {
          el.setAttribute('data-focused', 'true');
          el.style.background = '#0066cc';
          el.style.color = '#fff';
        } else {
          el.removeAttribute('data-focused');
          el.style.background = '';
          el.style.color = '#111';
        }
      });
      if (_menuSignals !== null) {
        const focused = items[focusIndex];
        const itemId = focused?.dataset['itemId'];
        if (itemId !== undefined) emitSignal(_menuSignals.onMenuItemHighlight, itemId);
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const focused = Array.from(focusableItems)[focusIndex];
        if (focused !== undefined) {
          const itemId = focused.dataset['itemId'];
          if (itemId !== undefined) close(itemId);
        }
      }
    }
    overlay.addEventListener('click', () => close(null));
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    document.body.appendChild(menu);
    clampMenu(menu, x, y);
  });
}

let _custom: MenuBackend | null = null;
let _host: MenuBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
let _menuSignals: MenuSignals | null = null;

const _sentinel: MenuBackend = {
  async popupContextMenu() {
    return null;
  },
  setApplicationMenu() {
    return false;
  },
  subscribeSelect() {
    return () => {};
  },
};

function releaseMenuBackends(previous: readonly (Readonly<MenuBackend> | null)[]): void {
  const retained = new Set<unknown>([_custom, _host].filter((slot) => slot !== null));
  const released = new Set<unknown>();
  for (const backend of previous) {
    if (backend === null || retained.has(backend) || released.has(backend)) continue;
    released.add(backend);
    backend.destroy?.();
  }
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

// Validates a MenuItemTemplate tree for consistency. Returns null on success, or a string describing
// the first violation found. Does not throw — returns a sentinel for expected failures. Throws only
// for cyclic submenu references (programmer error).
export function validateMenuItemTemplate(template: Readonly<MenuItemTemplate>): string | null {
  return _validateItem(template, new Set());
}

function buildWebMenuElement(items: readonly MenuItemTemplate[], onSelect: (id: string) => void): HTMLUListElement {
  const menu = document.createElement('ul');
  menu.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'margin:0',
    'padding:4px 0',
    'list-style:none',
    'background:#fff',
    'border:1px solid #ccc',
    'border-radius:4px',
    'box-shadow:0 4px 12px rgba(0,0,0,.15)',
    'min-width:160px',
    'font:13px/1.4 system-ui,sans-serif',
    'color:#111',
    'user-select:none',
  ].join(';');
  for (const item of items) {
    // Hidden items are not rendered at all, rather than rendered and styled away: an item that is not
    // in the DOM cannot be reached by arrow keys or hover, which is the difference between `visible`
    // and `enabled`.
    if (item.visible === false) continue;
    const li = document.createElement('li');
    if (item.type === 'separator') {
      li.style.cssText = 'height:1px;margin:4px 8px;background:#e0e0e0;';
      menu.appendChild(li);
      continue;
    }
    const enabled = item.enabled !== false;
    const hasSubmenu = item.submenu !== undefined && item.submenu.length > 0;
    li.setAttribute('data-enabled', enabled ? 'true' : 'false');
    if (item.id !== undefined) li.dataset['itemId'] = item.id;
    li.style.cssText = [
      'display:flex',
      'align-items:center',
      'padding:5px 12px 5px 28px',
      'cursor:' + (enabled ? 'default' : 'not-allowed'),
      'color:' + (enabled ? '#111' : '#999'),
      'position:relative',
    ].join(';');
    // Checkmark / radio dot
    if (item.checked === true) {
      const mark = document.createElement('span');
      mark.textContent = item.type === 'radio' ? '●' : '✓';
      mark.style.cssText = 'position:absolute;left:8px;font-size:11px;';
      li.appendChild(mark);
    }
    const labelEl = document.createElement('span');
    labelEl.textContent = item.label ?? '';
    labelEl.style.cssText = 'flex:1;';
    if (item.sublabel !== undefined) {
      const sublabelEl = document.createElement('span');
      sublabelEl.textContent = item.sublabel;
      sublabelEl.style.cssText = 'display:block;font-size:11px;color:#888;';
      labelEl.appendChild(sublabelEl);
    }
    li.appendChild(labelEl);
    // The accelerator/submenu spans below are matched with span:last-child on hover, so the tooltip is
    // set as an attribute rather than appended as another child.
    if (item.toolTip !== undefined) li.title = item.toolTip;
    if (hasSubmenu) {
      const arrow = document.createElement('span');
      arrow.textContent = '▶';
      arrow.style.cssText = 'margin-left:8px;font-size:9px;color:#888;';
      li.appendChild(arrow);
    } else if (item.accelerator !== undefined) {
      const accel = document.createElement('span');
      accel.textContent = item.accelerator;
      accel.style.cssText = 'margin-left:24px;color:#888;font-size:11px;';
      li.appendChild(accel);
    }
    if (enabled) {
      li.addEventListener('mouseenter', () => {
        li.style.background = '#0066cc';
        li.style.color = '#fff';
        const accelEl = li.querySelector<HTMLElement>('span:last-child');
        if (accelEl !== null && accelEl !== labelEl) accelEl.style.color = 'rgba(255,255,255,.7)';
        if (_menuSignals !== null && item.id !== undefined) {
          emitSignal(_menuSignals.onMenuItemHighlight, item.id);
        }
      });
      li.addEventListener('mouseleave', () => {
        li.style.background = '';
        li.style.color = '#111';
        const accelEl = li.querySelector<HTMLElement>('span:last-child');
        if (accelEl !== null && accelEl !== labelEl) accelEl.style.color = '#888';
      });
      if (hasSubmenu) {
        // Submenu: open on hover, select from child list.
        const submenuEl = buildWebMenuElement(item.submenu!, onSelect);
        submenuEl.style.position = 'absolute';
        submenuEl.style.top = '0';
        submenuEl.style.left = '100%';
        submenuEl.style.display = 'none';
        li.appendChild(submenuEl);
        li.addEventListener('mouseenter', () => {
          submenuEl.style.display = 'block';
        });
        li.addEventListener('mouseleave', () => {
          submenuEl.style.display = 'none';
        });
      } else if (item.id !== undefined) {
        const itemId = item.id;
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(itemId);
        });
      }
    }
    menu.appendChild(li);
  }
  return menu;
}
