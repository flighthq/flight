import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  MenuHighlightBackend,
  MenuItemTemplate,
  MenuPopupBackend,
} from '@flighthq/types/contract';

// The web menu providers. Web renders context menus itself in the DOM, so it exposes POPUP and — because
// it owns that rendering — HIGHLIGHT. It exposes neither `application` nor `select`: a browser has no
// native menu bar, so those slots are OMITTED rather than stubbed. The previous backend answered
// setApplicationMenu with an unconditional `false` and subscribeSelect with a no-op unsubscribe, which
// made web structurally indistinguishable from a host that really implements them.

export function initializeWebMenuHighlightBackend(out: EntityConstruction<MenuHighlightBackend>): void {
  out.subscribe = (listener: (id: string) => void): (() => void) => {
    _highlightListeners.add(listener);
    return () => {
      _highlightListeners.delete(listener);
    };
  };
}

export function initializeWebMenuPopupBackend(out: EntityConstruction<MenuPopupBackend>): void {
  out.popup = (items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null> => {
    return showWebContextMenu(items, x, y);
  };
}

export const webMenuHighlightBackend = (() => {
  const out = allocateEntity<MenuHighlightBackend>();
  initializeWebMenuHighlightBackend(out);
  return finishEntity(out);
})();

export const webMenuPopupBackend = (() => {
  const out = allocateEntity<MenuPopupBackend>();
  initializeWebMenuPopupBackend(out);
  return finishEntity(out);
})();

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
      const focused = items[focusIndex];
      const itemId = focused?.dataset['itemId'];
      if (itemId !== undefined) _emitHighlight(itemId);
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
        if (item.id !== undefined) _emitHighlight(item.id);
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

// Provider-local subscriber set for this overlay's highlight notifications. Subscription bookkeeping
// owned by the provider, not ambient capability resolution — nothing here decides which provider serves
// a call.
const _highlightListeners = new Set<(id: string) => void>();

function _emitHighlight(id: string): void {
  for (const listener of _highlightListeners) listener(id);
}
