import type { MenuItemTemplate } from './Menu';
import type { Signal } from './Signal';

// Application event entity. Enable delivery with attachApp; the signals stay inert until then.
export interface App {
  onActivate: Signal<() => void>;
  onOpenFile: Signal<(path: string) => void>;
  onSecondInstance: Signal<(argv: readonly string[]) => void>;
}

// Event and control seam for application identity, lifecycle, single-instance locking, and the dock.
// The web backend wraps document/window/navigator; a native host drives the same callbacks and APIs.
export interface AppBackend {
  getName(): string;
  getVersion(): string;
  getLocale(): string;
  quit(): void;
  relaunch(): void;
  focus(): void;
  requestSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
  hasSingleInstanceLock(): boolean;
  setDockBadge(text: string): void;
  // Sets the numeric app badge (taskbar overlay / dock / PWA navigator.setAppBadge). Returns false
  // when unsupported. This is the canonical home for the app badge (it is not on the tray).
  setBadgeCount(count: number): boolean;
  // Sets the macOS dock menu (right-click the dock icon). No-op where there is no dock.
  setDockMenu(items: readonly MenuItemTemplate[]): void;
  // Starts a dock bounce; returns a request id usable with cancelDockBounce, or -1 when unsupported.
  bounceDock(): number;
  cancelDockBounce(id: number): void;
  // Registers a listener invoked when the app is activated; returns an unsubscribe function.
  subscribeActivate(listener: () => void): () => void;
  // Registers a listener invoked when a file open is requested; returns an unsubscribe function.
  subscribeOpenFile(listener: (path: string) => void): () => void;
  // Registers a listener invoked when a second instance launches; returns an unsubscribe function.
  subscribeSecondInstance(listener: (argv: readonly string[]) => void): () => void;
}
