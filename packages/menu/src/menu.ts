import type { MenuBackend, MenuItemTemplate } from '@flighthq/types';

// Builds a menu item template, filling defaults (type 'normal', enabled true). Use this over a plain
// object literal so unspecified fields take their canonical defaults.
export function createMenuItemTemplate(template?: Readonly<Partial<MenuItemTemplate>>): MenuItemTemplate {
  return {
    type: 'normal',
    enabled: true,
    ...template,
  };
}

// Builds the default web backend. Web has no native menu bar or OS context menu, so setApplicationMenu
// returns false and popupContextMenu resolves null. A native host (Electron's Menu, Tauri) is required;
// a real web context-menu renderer is out of scope for the MVP.
export function createWebMenuBackend(): MenuBackend {
  return {
    setApplicationMenu() {
      return false;
    },
    async popupContextMenu() {
      return null;
    },
    subscribeSelect() {
      // Web app-menu has no select source — native host (Electron/Tauri) required. The context menu
      // still returns its clicked id via popupContextMenu/showContextMenu.
      return () => {};
    },
  };
}

// The active menu backend, or a lazily-created web default. There is always a backend.
export function getMenuBackend(): MenuBackend {
  if (_backend === null) _backend = createWebMenuBackend();
  return _backend;
}

// Subscribes to application menu item selections, delivering the selected item id. Returns an
// unsubscribe function. On web this never fires (no native menu bar); a native host is required.
export function onMenuSelect(listener: (id: string) => void): () => void {
  return getMenuBackend().subscribeSelect(listener);
}

// Sets the application menu bar. Returns false when the host lacks a native menu bar (e.g. web).
export function setApplicationMenu(items: readonly MenuItemTemplate[]): boolean {
  return getMenuBackend().setApplicationMenu(items);
}

// Installs a native host menu backend; pass null to fall back to the web default.
export function setMenuBackend(backend: MenuBackend | null): void {
  _backend = backend;
}

// Pops up a context menu at (x, y) and resolves the clicked item id, or null when dismissed or
// unsupported (e.g. web).
export function showContextMenu(items: readonly MenuItemTemplate[], x: number, y: number): Promise<string | null> {
  return getMenuBackend().popupContextMenu(items, x, y);
}

let _backend: MenuBackend | null = null;
