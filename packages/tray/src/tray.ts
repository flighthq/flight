import type { MenuItemTemplate, TrayBackend, TrayEventType, TrayIcon, TrayIconOptions } from '@flighthq/types';

// Creates a tray icon, or null when the host has no system tray (e.g. web). The backend returns -1 to
// signal no tray; this translates that to a null sentinel for the caller.
export function createTrayIcon(options?: Readonly<TrayIconOptions>): TrayIcon | null {
  const id = getTrayBackend().create(options ?? {});
  return id < 0 ? null : { id };
}

// Builds the default web backend. Web has no system tray, so create returns -1 and the tray mutators
// are no-ops — a native host (Electron's Tray, Tauri) is required for the tray icon itself. (The
// application/dock badge lives in @flighthq/app's setAppBadgeCount, not here.)
export function createWebTrayBackend(): TrayBackend {
  return {
    create() {
      // No tray on web. -1 signals "unsupported"; createTrayIcon maps it to null.
      return -1;
    },
    destroy() {
      // No-op: web has no tray icon to destroy.
    },
    setTooltip() {
      // No-op: web has no tray icon to update.
    },
    setTitle() {
      // No-op: web has no tray icon to update.
    },
    setContextMenu() {
      // No-op: web has no tray icon — a native host (Electron/Tauri) is required.
    },
    subscribe() {
      // No tray on web — a native host (Electron/Tauri) is required to emit tray events.
      return () => {};
    },
  };
}

// Destroys a tray icon and frees its host resource. No-op when the host has no tray.
export function destroyTrayIcon(tray: TrayIcon): void {
  getTrayBackend().destroy(tray.id);
}

// The active tray backend, or a lazily-created web default. There is always a backend.
export function getTrayBackend(): TrayBackend {
  if (_backend === null) _backend = createWebTrayBackend();
  return _backend;
}

// Subscribes to tray icon events (click, right-click, double-click), delivering the tray id and event
// type. Returns an unsubscribe function. On web this never fires (no tray); a native host is required.
export function onTrayEvent(listener: (id: number, event: TrayEventType) => void): () => void {
  return getTrayBackend().subscribe(listener);
}

// Installs a native host tray backend; pass null to fall back to the web default.
export function setTrayBackend(backend: TrayBackend | null): void {
  _backend = backend;
}

// Sets a tray icon's context menu. No-op when the host has no tray.
export function setTrayContextMenu(tray: TrayIcon, items: readonly MenuItemTemplate[]): void {
  getTrayBackend().setContextMenu(tray.id, items);
}

// Sets a tray icon's title text. No-op when the host has no tray.
export function setTrayIconTitle(tray: TrayIcon, title: string): void {
  getTrayBackend().setTitle(tray.id, title);
}

// Sets a tray icon's hover tooltip. No-op when the host has no tray.
export function setTrayIconTooltip(tray: TrayIcon, tooltip: string): void {
  getTrayBackend().setTooltip(tray.id, tooltip);
}

let _backend: TrayBackend | null = null;
