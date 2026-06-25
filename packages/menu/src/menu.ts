import { createSignal, emitSignal } from '@flighthq/signals';
import type { MenuBackend, MenuItemTemplate, MenuSignals } from '@flighthq/types';

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

// Builds the default web backend. The app-menu bar returns false (native host required for a true menu
// bar). popupContextMenu delegates to the DOM-rendered context-menu popup. subscribeSelect never fires
// on web (no native app menu).
export function createWebMenuBackend(): MenuBackend {
  return {
    setApplicationMenu() {
      // Web has no native menu bar; return false (not an error — caller should handle gracefully).
      return false;
    },
    popupContextMenu(items, x, y) {
      return showWebContextMenu(items, x, y);
    },
    subscribeSelect() {
      // Web app-menu has no select source — native host required.
      return () => {};
    },
  };
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

// Returns the active backend; lazily creates a web default on first call.
export function getMenuBackend(): MenuBackend {
  if (_backend === null) _backend = createWebMenuBackend();
  return _backend;
}

// Returns the active MenuSignals group, or null if enableMenuSignals has not been called.
export function getMenuSignals(): Readonly<MenuSignals> | null {
  return _menuSignals;
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

// Installs the application menu bar. Returns true on success, or false when the host lacks a native
// menu bar (e.g. web).
export function setApplicationMenu(items: readonly MenuItemTemplate[]): boolean {
  return getMenuBackend().setApplicationMenu(items);
}

// Sets the active menu backend; pass null to fall back to the web default.
export function setMenuBackend(backend: MenuBackend | null): void {
  _backend = backend;
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

// Validates a MenuItemTemplate tree for consistency. Returns null on success, or a string describing
// the first violation found. Does not throw — returns a sentinel for expected failures. Throws only
// for cyclic submenu references (programmer error).
export function validateMenuItemTemplate(template: Readonly<MenuItemTemplate>): string | null {
  return _validateItem(template, new Set());
}

let _backend: MenuBackend | null = null;
let _menuSignals: MenuSignals | null = null;

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
  if (item.submenu !== undefined) {
    seen.add(item);
    for (const child of item.submenu) {
      const err = _validateItem(child, seen);
      if (err !== null) return err;
    }
    seen.delete(item);
  }
  return null;
}

// --- Web context-menu renderer ---
// Renders a minimal DOM popup for showContextMenu in a browser environment. Returns the clicked item
// id or null when the menu is dismissed without a selection. Supports keyboard navigation (ArrowUp/
// Down, Enter, Escape) and submenu expansion on hover/arrow-right.
function showWebContextMenu(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null> {
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
    // Keyboard navigation
    const focusableItems = menu.querySelectorAll<HTMLElement>('li[data-enabled="true"]');
    let focusIndex = -1;
    function moveFocus(delta: number): void {
      const items = Array.from(focusableItems);
      if (items.length === 0) return;
      focusIndex = (focusIndex + delta + items.length) % items.length;
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
    li.appendChild(labelEl);
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
