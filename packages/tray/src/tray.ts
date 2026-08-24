import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  MenuItemTemplate,
  RectangleLike,
  TrayBackend,
  TrayBalloonOptions,
  TrayCapabilities,
  TrayEventData,
  TrayIcon,
  TrayIconOptions,
} from '@flighthq/types/contract';
import type { Vector2Like } from '@flighthq/types/contract';

// Web tray capability constants. Web has no system tray — all capabilities are false. Readonly and
// shared: getCapabilities hands this same object to every caller, so a mutable one would let any of
// them rewrite what the backend reports to all the others.
const WEB_CAPABILITIES: Readonly<TrayCapabilities> = {
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

// Destroys a tray icon and frees its host resource. No-op when the host has no tray.
// Any icon animation running on this tray is stopped first: the interval writes through setTrayIcon,
// and left running it would keep calling into a resource the host has freed — forever, since the
// timer holds its own closure alive. Destroying the thing being animated is the clearest possible
// signal that the animation is over, so the caller does not have to have kept the stop function.
export function destroyTrayIcon(tray: TrayIcon): void {
  stopTrayIconAnimation(tray);
  getTrayBackend().destroy(tray.id);
}

// Displays a Windows balloon notification from the tray icon. No-op on macOS/Linux and on web.
// Balloon lifecycle events (balloonShow/balloonClick/balloonClose) are emitted via onTrayEvent.
export function displayTrayBalloon(tray: TrayIcon, options: Readonly<TrayBalloonOptions>): void {
  getTrayBackend().displayBalloon(tray.id, options);
}

export function explainTrayBackend(): BackendExplanation {
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

// The active tray backend. Precedence: custom > host > sentinel.
export function getTrayBackend(): TrayBackend {
  return _custom ?? _host ?? _sentinel;
}

// Returns the capability flags for the active tray backend. Use before calling APIs that may
// silently no-op — for example, check capabilities.balloon before displayTrayBalloon, or
// capabilities.bounds before getTrayIconBounds. On web all flags are false.
export function getTrayCapabilities(): Readonly<TrayCapabilities> {
  return getTrayBackend().getCapabilities();
}

// Returns the screen bounds of the tray icon (x/y/width/height), or null when the platform does not
// expose icon geometry (Linux/AppIndicator, web). Use for anchoring popovers or windows to the icon.
export function getTrayIconBounds(tray: TrayIcon): Readonly<RectangleLike> | null {
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

export function installTrayHostBackend(backend: TrayBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

// Returns whether a tray icon has been destroyed. Returns true on web (no trays exist).
// Use this to guard calls after destroyTrayIcon when the tray lifecycle is unclear.
export function isTrayDestroyed(tray: TrayIcon): boolean {
  return getTrayBackend().isDestroyed(tray.id);
}

// True while an icon animation started by startTrayIconAnimation is running on this tray. False once
// it is stopped, replaced by a later start, or the tray is destroyed.
export function isTrayIconAnimating(tray: TrayIcon): boolean {
  return _animations.has(tray.id);
}

export function observeTrayHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
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

export function resetTrayBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

/** Installs the tray guard, or clears it with `null`. The seam exists so the messages and the
 *  `@flighthq/log` dependency live in the separately-importable guard module rather than here; not
 *  importing that module costs production nothing. Called by `enableTrayGuards`, not directly. */
export function setTrayAnimationGuard(
  guard: ((tray: TrayIcon, frameCount: number, intervalMs: number) => void) | null,
): void {
  _animationGuard = guard;
}

// Installs a custom tray backend; pass null to clear the custom override.
export function setTrayBackend(backend: TrayBackend | null): void {
  _custom = backend;
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

// Starts an animated icon sequence by cycling through the given frames at the specified interval,
// returning a stop function. An empty frame list is a no-op. The tray icon is not destroyed when the
// animation stops, and the last frame shown stays.
//
// A tray icon has one image, so it has one animation: starting a second on the same tray replaces the
// first rather than running both. Without that, a perfectly ordinary sequence — swap a "syncing"
// animation for an "error" one — left two intervals writing to the same icon on the same tick, and
// the only handle to the orphaned one was a stop function the caller had no reason to still be
// holding. The returned function stops only the animation it started, so calling a stale one cannot
// cancel a newer animation.
//
// Note: interval timing is best-effort; the actual frame rate depends on the host event loop.
export function startTrayIconAnimation(tray: TrayIcon, frames: readonly string[], intervalMs: number): () => void {
  if (frames.length === 0) return _noopStop;
  _animationGuard?.(tray, frames.length, intervalMs);
  stopTrayIconAnimation(tray);
  let index = 0;
  setTrayIcon(tray, frames[index]!);
  const handle = setInterval(() => {
    index = (index + 1) % frames.length;
    setTrayIcon(tray, frames[index]!);
  }, intervalMs);
  _animations.set(tray.id, handle);
  return () => {
    // Only clear if this animation is still the current one; a later start already replaced it.
    if (_animations.get(tray.id) !== handle) return;
    clearInterval(handle);
    _animations.delete(tray.id);
  };
}

// The interval per animating tray id. Module-scoped like the backend, and correct at that scope: an
// id is the host's, so one id is one icon is one animation.
const _animations = new Map<number, ReturnType<typeof setInterval>>();

function _noopStop(): void {}

// Stops the icon animation running on this tray, if any. Idempotent, and safe on a tray that never
// animated. The named counterpart to startTrayIconAnimation for callers that hold the TrayIcon but
// not the stop function it returned — which is most of them, since the handle is what gets passed
// around and the closure is what gets dropped.
export function stopTrayIconAnimation(tray: TrayIcon): void {
  const handle = _animations.get(tray.id);
  if (handle === undefined) return;
  clearInterval(handle);
  _animations.delete(tray.id);
}

let _animationGuard: ((tray: TrayIcon, frameCount: number, intervalMs: number) => void) | null = null;
let _custom: TrayBackend | null = null;
let _host: TrayBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: TrayBackend = {
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
