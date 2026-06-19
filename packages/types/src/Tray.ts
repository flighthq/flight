import type { MenuItemTemplate } from './Menu';

// Tray icon seam. Free functions in @flighthq/tray delegate to the active TrayBackend (web default or
// a native host's). Web has no tray icon, so the web backend returns -1 / no-op sentinels — the tray
// icon requires a native host (Electron/Tauri). The application/dock badge lives in @flighthq/app.
export type TrayEventType = 'click' | 'rightClick' | 'doubleClick';

export interface TrayIconOptions {
  icon?: string;
  tooltip?: string;
  title?: string;
}

export interface TrayIcon {
  id: number;
}

export interface TrayBackend {
  create(options: Readonly<TrayIconOptions>): number;
  destroy(id: number): void;
  setTooltip(id: number, tooltip: string): void;
  setTitle(id: number, title: string): void;
  setContextMenu(id: number, items: readonly MenuItemTemplate[]): void;
  subscribe(listener: (id: number, event: TrayEventType) => void): () => void;
}
