import type { MenuItemTemplate } from './Menu';
import type { RectangleLike } from './Rectangle';
import type { Vector2Like } from './Vector2';

// Tray icon seam. Free functions in @flighthq/tray delegate to the active TrayBackend (web default or
// a native host's). Web has no tray icon, so the web backend returns -1 / no-op sentinels — the tray
// icon requires a native host (Electron/Tauri). The application/dock badge lives in @flighthq/app.
export type TrayEventType =
  | 'balloonClick'
  | 'balloonClose'
  | 'balloonShow'
  | 'click'
  | 'doubleClick'
  | 'dropFiles'
  | 'rightClick';

export interface TrayIconOptions {
  icon?: string;
  // Mark the initial icon as a macOS template image (auto-inverts for light/dark menu bars).
  iconTemplate?: boolean;
  title?: string;
  tooltip?: string;
}

// Windows balloon notification shown from the tray icon. title/text are required; the rest are
// Windows-specific refinements. iconType selects the system glyph shown beside the balloon.
export interface TrayBalloonOptions {
  icon?: string;
  iconType?: 'none' | 'info' | 'warning' | 'error';
  largeIcon?: boolean;
  noSound?: boolean;
  respectQuietTime?: boolean;
  text: string;
  title: string;
}

// Per-backend capability flags. Use before calling APIs that may silently no-op (e.g. check
// capabilities.balloon before displayTrayBalloon). On web every flag is false.
export interface TrayCapabilities {
  balloon: boolean;
  bounds: boolean;
  clickEvents: boolean;
  dropFiles: boolean;
  pressedIcon: boolean;
  title: boolean;
}

// Rich tray event payload delivered to onTrayEvent subscribers. bounds/position are null when the
// platform does not report them; dropFiles/dropText are populated only for drop events.
export interface TrayEventData {
  altKey: boolean;
  bounds: Readonly<RectangleLike> | null;
  ctrlKey: boolean;
  dropFiles: readonly string[] | null;
  dropText: string | null;
  id: number;
  metaKey: boolean;
  position: Readonly<Vector2Like> | null;
  shiftKey: boolean;
  type: TrayEventType;
}

export interface TrayIcon {
  id: number;
}

export interface TrayBackend {
  create(options: Readonly<TrayIconOptions>): number;
  destroy(id: number): void;
  displayBalloon(id: number, options: Readonly<TrayBalloonOptions>): void;
  getBounds(id: number): Readonly<RectangleLike> | null;
  getCapabilities(): Readonly<TrayCapabilities>;
  getTitle(id: number): string;
  getTooltip(id: number): string;
  isDestroyed(id: number): boolean;
  listIds(): readonly number[];
  popUpContextMenu(id: number, position?: Readonly<Vector2Like>): void;
  removeBalloon(id: number): void;
  setContextMenu(id: number, items: readonly MenuItemTemplate[]): void;
  setIcon(id: number, icon: string): void;
  setIgnoreDoubleClickEvents(id: number, ignore: boolean): void;
  setPressedIcon(id: number, icon: string): void;
  setTemplate(id: number, isTemplate: boolean): void;
  setTitle(id: number, title: string): void;
  setTooltip(id: number, tooltip: string): void;
  subscribe(listener: (event: Readonly<TrayEventData>) => void): () => void;
}
