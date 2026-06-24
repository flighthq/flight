import type {
  MenuItemTemplate,
  TrayBackend,
  TrayBalloonOptions,
  TrayCapabilities,
  TrayEventData,
  TrayIcon,
  TrayIconOptions,
} from '@flighthq/types';
import type { Vector2Like } from '@flighthq/types';

// Web tray capability constants. Web has no system tray — all capabilities are false.
const WEB_CAPABILITIES: TrayCapabilities = {
  balloon: false,
  bounds: false,
  clickEvents: false,
  dropFiles: false,
  pressedIcon: false,
  title: false,
};

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
    displayBalloon() {
      // No-op: balloon notifications require a native host (Windows only).
    },
    getBounds() {
      // No tray on web; null signals unavailable.
      return null;
    },
    getCapabilities() {
      return WEB_CAPABILITIES;
    },
    getTitle() {
      // No tray on web.
      return '';
    },
    getTooltip() {
      // No tray on web.
      return '';
    },
    isDestroyed() {
      // No tray icons exist on web; treat every id as destroyed.
      return true;
    },
    listIds() {
      // No tray icons exist on web.
      return [];
    },
    popUpContextMenu() {
      // No-op: web has no context menu to pop up.
    },
    removeBalloon() {
      // No-op: balloon notifications require a native host (Windows only).
    },
    setContextMenu() {
      // No-op: web has no tray icon — a native host (Electron/Tauri) is required.
    },
    setIcon() {
      // No-op: web has no tray icon to update.
    },
    setIgnoreDoubleClickEvents() {
      // No-op: web has no tray icon double-click behavior to configure.
    },
    setPressedIcon() {
      // No-op: web has no tray icon; pressed icon is macOS-specific.
    },
    setTemplate() {
      // No-op: template images are a macOS menu-bar concept; irrelevant on web.
    },
    setTitle() {
      // No-op: web has no tray icon to update.
    },
    setTooltip() {
      // No-op: web has no tray icon to update.
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

// Displays a Windows balloon notification from the tray icon. No-op on macOS/Linux and on web.
// Balloon lifecycle events (balloonShow/balloonClick/balloonClose) are emitted via onTrayEvent.
export function displayTrayBalloon(tray: TrayIcon, options: Readonly<TrayBalloonOptions>): void {
  getTrayBackend().displayBalloon(tray.id, options);
}

// The active tray backend, or a lazily-created web default. There is always a backend.
export function getTrayBackend(): TrayBackend {
  if (_backend === null) _backend = createWebTrayBackend();
  return _backend;
}

// Returns the capability flags for the active tray backend. Use before calling APIs that may
// silently no-op — for example, check capabilities.balloon before displayTrayBalloon, or
// capabilities.bounds before getTrayIconBounds. On web all flags are false.
export function getTrayCapabilities(): Readonly<TrayCapabilities> {
  return getTrayBackend().getCapabilities();
}

// Returns the screen bounds of the tray icon (x/y/width/height), or null when the platform does not
// expose icon geometry (Linux/AppIndicator, web). Use for anchoring popovers or windows to the icon.
export function getTrayIconBounds(
  tray: TrayIcon,
): Readonly<{ height: number; width: number; x: number; y: number }> | null {
  return getTrayBackend().getBounds(tray.id);
}

// Returns all live tray icon handles known to the active backend. On web this is always empty.
export function getTrayIcons(): readonly TrayIcon[] {
  return getTrayBackend()
    .listIds()
    .map((id) => ({ id }));
}

// Returns the current title text of a tray icon, or an empty string when unavailable (web, non-macOS).
export function getTrayIconTitle(tray: TrayIcon): string {
  return getTrayBackend().getTitle(tray.id);
}

// Returns the current hover tooltip text of a tray icon, or an empty string when unavailable (web).
export function getTrayIconTooltip(tray: TrayIcon): string {
  return getTrayBackend().getTooltip(tray.id);
}

// Returns whether a tray icon has been destroyed. Returns true on web (no trays exist).
// Use this to guard calls after destroyTrayIcon when the tray lifecycle is unclear.
export function isTrayDestroyed(tray: TrayIcon): boolean {
  return getTrayBackend().isDestroyed(tray.id);
}

// Subscribes to tray icon events, delivering a rich TrayEventData payload (id, type, bounds,
// position, modifier keys, and drop payloads). Returns an unsubscribe function. On web this
// never fires (no tray); a native host is required.
export function onTrayEvent(listener: (event: Readonly<TrayEventData>) => void): () => void {
  return getTrayBackend().subscribe(listener);
}

// Programmatically shows the attached context menu, optionally at a specific screen position.
// On web this is a no-op. Useful for showing the menu in response to a custom gesture or shortcut
// without waiting for the user to right-click the tray icon.
export function popupTrayContextMenu(tray: TrayIcon, position?: Readonly<Vector2Like>): void {
  getTrayBackend().popUpContextMenu(tray.id, position);
}

// Dismisses the currently-displayed Windows balloon notification. No-op on macOS/Linux and web.
export function removeTrayBalloon(tray: TrayIcon): void {
  getTrayBackend().removeBalloon(tray.id);
}

// Installs a native host tray backend; pass null to fall back to the web default.
export function setTrayBackend(backend: TrayBackend | null): void {
  _backend = backend;
}

// Sets the image for the tray icon. Accepts the same icon path/data-URI accepted by createTrayIcon.
// Use this for runtime status updates (indicators, spinners, theme changes).
export function setTrayIcon(tray: TrayIcon, icon: string): void {
  getTrayBackend().setIcon(tray.id, icon);
}

// Sets the context menu attached to a tray icon. Shown on right-click (or popupTrayContextMenu).
// No-op when the host has no tray.
export function setTrayIconContextMenu(tray: TrayIcon, items: readonly MenuItemTemplate[]): void {
  getTrayBackend().setContextMenu(tray.id, items);
}

// Marks the tray icon as a macOS template image. Template images auto-invert for light/dark menu
// bars. No-op on Windows/Linux and on web. Set iconTemplate:true on TrayIconOptions at creation to
// combine with the initial icon, or call this after creation to update the flag dynamically.
export function setTrayIconTemplate(tray: TrayIcon, isTemplate: boolean): void {
  getTrayBackend().setTemplate(tray.id, isTemplate);
}

// Sets the title text displayed next to the tray icon (macOS menu bar only). No-op on other platforms.
export function setTrayIconTitle(tray: TrayIcon, title: string): void {
  getTrayBackend().setTitle(tray.id, title);
}

// Sets the hover tooltip for the tray icon. No-op when the host has no tray.
export function setTrayIconTooltip(tray: TrayIcon, tooltip: string): void {
  getTrayBackend().setTooltip(tray.id, tooltip);
}

// Sets whether the host should collapse double-click events into individual click events (macOS).
// No-op on Windows/Linux and on web.
export function setTrayIgnoreDoubleClickEvents(tray: TrayIcon, ignore: boolean): void {
  getTrayBackend().setIgnoreDoubleClickEvents(tray.id, ignore);
}

// Sets the image shown when the tray icon is pressed (macOS only). Electron calls this
// setPressedImage. No-op on Windows/Linux and on web.
export function setTrayPressedIcon(tray: TrayIcon, icon: string): void {
  getTrayBackend().setPressedIcon(tray.id, icon);
}

// Starts an animated icon sequence by cycling through the given frames at the specified interval.
// The caller owns the timer — this function is a thin helper over setTrayIcon that starts an
// interval and returns a stop function. Call the returned function (or stopTrayIconAnimation) to
// cancel. The tray icon is not destroyed when the animation stops.
// Note: interval timing is best-effort; the actual frame rate depends on the host event loop.
export function startTrayIconAnimation(tray: TrayIcon, frames: readonly string[], intervalMs: number): () => void {
  if (frames.length === 0) return () => {};
  let index = 0;
  setTrayIcon(tray, frames[index]!);
  const handle = setInterval(() => {
    index = (index + 1) % frames.length;
    setTrayIcon(tray, frames[index]!);
  }, intervalMs);
  return () => clearInterval(handle);
}

let _backend: TrayBackend | null = null;
