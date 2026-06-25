import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  RectangleLike,
  ScreenBackend,
  ScreenChangedMetrics,
  ScreenChangeEvent,
  ScreenColorSpace,
  ScreenInfo,
  ScreenMode,
  ScreenOrientation,
  ScreenSignals,
  Vector2Like,
} from '@flighthq/types';

// Attaches the active backend's change subscription to `signals`, fanning out events to the
// appropriate signal for each ScreenChangeKind. Idempotent: a prior subscription is torn down first.
// Pair with detachScreenSignals / disposeScreenSignals.
export function attachScreenSignals(signals: ScreenSignals): void {
  detachScreenSignals(signals);
  const unsubscribe = getScreenBackend().subscribe((event) => {
    if (event.kind === 'ScreenAdded') {
      emitSignal(signals.onScreenAdded, event.screen);
    } else if (event.kind === 'ScreenRemoved') {
      emitSignal(signals.onScreenRemoved, event.screen);
    } else {
      emitSignal(signals.onScreenMetricsChanged, event);
    }
  });
  _signalSubscriptions.set(signals, unsubscribe);
}

// Allocates a zeroed ScreenInfo; use as the `out` for getPrimaryScreen or as an array slot for
// getScreens. scaleFactor defaults to 1 (no scaling) and isPrimary to false.
export function createScreenInfo(): ScreenInfo {
  return {
    id: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    workWidth: 0,
    workHeight: 0,
    scaleFactor: 1,
    isPrimary: false,
    rotation: -1,
    orientation: 'Landscape',
    refreshRate: -1,
    colorDepth: -1,
    pixelDepth: -1,
    physicalWidth: -1,
    physicalHeight: -1,
    isHdr: false,
    colorSpace: 'srgb',
    maxLuminance: -1,
    depthPerComponent: -1,
    dpi: -1,
    label: '',
    internal: false,
    touchSupport: 'unknown',
    monochrome: false,
  };
}

// Allocates a zeroed ScreenMode; use as an array slot for getScreenModes / getScreenCurrentMode.
export function createScreenMode(): ScreenMode {
  return {
    width: 0,
    height: 0,
    refreshRate: -1,
    colorDepth: -1,
    pixelFormat: '',
  };
}

// Allocates a ScreenSignals group with inert signals; call attachScreenSignals to start delivery.
export function createScreenSignals(): ScreenSignals {
  return {
    onScreenAdded: createSignal(),
    onScreenMetricsChanged: createSignal(),
    onScreenRemoved: createSignal(),
  };
}

// Builds the default web backend over window.screen. The web reports a single logical display; a
// native host (Electron/Tauri) replaces this to enumerate every attached monitor. Reads fill `out`
// with zeros when window/screen are absent (jsdom) rather than throwing.
// ScreenDetailed and ScreenDetails are part of the Window Management API (screen-wake-lock /
// window-management permission). They are not in the standard TypeScript lib, so we type them
// minimally here for web backend use only.
interface ScreenDetailed {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number;
  devicePixelRatio: number;
  height: number;
  isExtended?: boolean;
  isInternal?: boolean;
  isPrimary?: boolean;
  label: string;
  left: number;
  pixelDepth: number;
  refreshRate?: number;
  top: number;
  width: number;
}

interface ScreenDetails {
  currentScreen: ScreenDetailed;
  screens: ScreenDetailed[];
  addEventListener(type: 'screenschange', listener: () => void): void;
  removeEventListener(type: 'screenschange', listener: () => void): void;
}

// Builds the default web backend over window.screen. The web reports a single logical display until
// requestScreenDetails() upgrades it to the full multi-monitor Screen Details API. A native host
// (Electron/Tauri) replaces this backend via setScreenBackend to enumerate every attached monitor.
// All reads fill `out` with zeros when window/screen are absent (jsdom) rather than throwing.
export function createWebScreenBackend(): ScreenBackend {
  let _cursorX = 0;
  let _cursorY = 0;
  let _cursorTracking = false;
  let _cachedScreens: ScreenInfo[] | null = null;
  // Set by upgradeToScreenDetails() when the Window Management permission is granted.
  let _screenDetails: ScreenDetails | null = null;

  function ensureCursorTracking(): void {
    if (_cursorTracking || typeof window === 'undefined') return;
    _cursorTracking = true;
    window.addEventListener('pointermove', (e: PointerEvent) => {
      _cursorX = e.screenX;
      _cursorY = e.screenY;
    });
  }

  // Upgrades the backend to use the Screen Details API. Called by requestScreenDetails() on success.
  function upgradeToScreenDetails(details: ScreenDetails): void {
    _screenDetails = details;
    // Invalidate cache so the next enumeration reflects the multi-screen view.
    _cachedScreens = null;
  }

  function buildScreenInfoFromDetailed(sd: ScreenDetailed, index: number, primaryIndex: number, out: ScreenInfo): void {
    out.id = index;
    out.x = sd.left;
    out.y = sd.top;
    out.width = sd.width;
    out.height = sd.height;
    out.workWidth = sd.availWidth;
    out.workHeight = sd.availHeight;
    out.scaleFactor = typeof sd.devicePixelRatio === 'number' ? sd.devicePixelRatio : 1;
    out.isPrimary = index === primaryIndex || (sd.isPrimary ?? index === 0);
    out.rotation = getWebRotation();
    out.orientation = getWebOrientation();
    // ScreenDetailed.refreshRate is available when the Window Management permission is granted.
    out.refreshRate = typeof sd.refreshRate === 'number' && sd.refreshRate > 0 ? sd.refreshRate : -1;
    out.colorDepth = typeof sd.colorDepth === 'number' ? sd.colorDepth : -1;
    out.pixelDepth = typeof sd.pixelDepth === 'number' ? sd.pixelDepth : -1;
    out.physicalWidth = Math.round(out.width * out.scaleFactor);
    out.physicalHeight = Math.round(out.height * out.scaleFactor);
    out.isHdr = getWebIsHdr();
    out.colorSpace = getWebColorSpace();
    out.maxLuminance = -1;
    out.depthPerComponent = -1;
    out.dpi = -1;
    out.label = typeof sd.label === 'string' ? sd.label : '';
    // isInternal is true for built-in displays (laptop panel, phone screen).
    out.internal = sd.isInternal ?? false;
    out.touchSupport = 'unknown';
    out.monochrome = false;
  }

  function buildCurrentScreenInfo(out: ScreenInfo): void {
    if (typeof window === 'undefined' || typeof window.screen === 'undefined') {
      fillDefaultScreenInfo(out);
      return;
    }
    // When the Screen Details API is active, use the currentScreen for the single-screen view.
    if (_screenDetails !== null) {
      const screens = _screenDetails.screens;
      const primaryIndex = screens.findIndex((s) => s.isPrimary ?? false);
      const current = _screenDetails.currentScreen;
      const currentIndex = screens.indexOf(current);
      buildScreenInfoFromDetailed(current, currentIndex >= 0 ? currentIndex : 0, primaryIndex, out);
      return;
    }
    const s = window.screen;
    out.id = 0;
    out.x = 0;
    out.y = 0;
    out.width = s.width;
    out.height = s.height;
    out.workWidth = s.availWidth;
    out.workHeight = s.availHeight;
    out.scaleFactor = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;
    out.isPrimary = true;
    out.rotation = getWebRotation();
    out.orientation = getWebOrientation();
    out.refreshRate = -1;
    out.colorDepth = typeof s.colorDepth === 'number' ? s.colorDepth : -1;
    out.pixelDepth = typeof s.pixelDepth === 'number' ? s.pixelDepth : -1;
    out.physicalWidth = Math.round(out.width * out.scaleFactor);
    out.physicalHeight = Math.round(out.height * out.scaleFactor);
    out.isHdr = getWebIsHdr();
    out.colorSpace = getWebColorSpace();
    out.maxLuminance = -1;
    out.depthPerComponent = -1;
    out.dpi = -1;
    out.label = '';
    out.internal = false;
    out.touchSupport = 'unknown';
    out.monochrome = false;
  }

  const backend: ScreenBackend & { _upgrade: (d: ScreenDetails) => void } = {
    // Internal: called by requestScreenDetails on success.
    _upgrade: upgradeToScreenDetails,

    getScreens(out) {
      if (typeof window === 'undefined' || typeof window.screen === 'undefined') {
        out.length = 0;
        return out;
      }
      // Multi-monitor path: enumerate via Screen Details API when permission is granted.
      if (_screenDetails !== null) {
        const screens = _screenDetails.screens;
        const primaryIndex = screens.findIndex((s) => s.isPrimary ?? false);
        out.length = screens.length;
        for (let i = 0; i < screens.length; i++) {
          if (out[i] === undefined) out[i] = createScreenInfo();
          buildScreenInfoFromDetailed(screens[i], i, primaryIndex, out[i]);
        }
        _cachedScreens = out.slice(0, screens.length).map((s) => ({ ...s }));
        return out;
      }
      // Single-monitor path (default): read window.screen.
      out.length = 1;
      if (out[0] === undefined) out[0] = createScreenInfo();
      buildCurrentScreenInfo(out[0]);
      // Cache for change detection in subscribe.
      _cachedScreens = [{ ...out[0] }];
      return out;
    },

    getPrimaryScreen(out) {
      if (typeof window === 'undefined' || typeof window.screen === 'undefined') {
        fillDefaultScreenInfo(out);
        return out;
      }
      if (_screenDetails !== null) {
        const screens = _screenDetails.screens;
        const primaryIndex = screens.findIndex((s) => s.isPrimary ?? false);
        const idx = primaryIndex >= 0 ? primaryIndex : 0;
        if (screens.length > 0) {
          buildScreenInfoFromDetailed(screens[idx], idx, idx, out);
          return out;
        }
      }
      buildCurrentScreenInfo(out);
      return out;
    },

    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};

      // Build initial cache for diffing.
      if (_cachedScreens === null) {
        const scratch = createScreenInfo();
        buildCurrentScreenInfo(scratch);
        _cachedScreens = [{ ...scratch }];
      }

      const handleChange = () => {
        if (_screenDetails !== null) {
          // Multi-monitor: diff each screen and emit add/remove/metrics events.
          const details = _screenDetails;
          const screens = details.screens;
          const primaryIndex = screens.findIndex((s) => s.isPrimary ?? false);
          const newInfos: ScreenInfo[] = screens.map((sd, i) => {
            const info = createScreenInfo();
            buildScreenInfoFromDetailed(sd, i, primaryIndex, info);
            return info;
          });
          const prevCache = _cachedScreens ?? [];

          // Detect removed screens (were in prev, not in new).
          for (const prev of prevCache) {
            const stillPresent = newInfos.some((n) => n.id === prev.id);
            if (!stillPresent) {
              listener({ kind: 'ScreenRemoved', screen: prev, changedMetrics: null });
            }
          }
          // Detect added screens and metrics changes.
          for (const curr of newInfos) {
            const prev = prevCache.find((p) => p.id === curr.id);
            if (prev === undefined) {
              listener({ kind: 'ScreenAdded', screen: curr, changedMetrics: null });
            } else {
              const changed = diffScreenInfo(prev, curr);
              if (changed !== null) {
                listener({ kind: 'ScreenMetricsChanged', screen: curr, changedMetrics: changed });
              }
            }
          }
          _cachedScreens = newInfos.map((s) => ({ ...s }));
          return;
        }

        // Single-monitor path.
        const scratch = createScreenInfo();
        buildCurrentScreenInfo(scratch);
        const prev = _cachedScreens?.[0];
        if (prev === undefined) {
          _cachedScreens = [{ ...scratch }];
          listener({ kind: 'ScreenAdded', screen: scratch, changedMetrics: null });
          return;
        }
        const changed = diffScreenInfo(prev, scratch);
        if (changed !== null) {
          Object.assign(prev, scratch);
          listener({ kind: 'ScreenMetricsChanged', screen: scratch, changedMetrics: changed });
        }
      };

      window.addEventListener('resize', handleChange);
      const orientation = getWebScreenOrientationObject();
      orientation?.addEventListener?.('change', handleChange);

      // If Screen Details API is active, also subscribe to screenschange events.
      const detailsRef = _screenDetails;
      detailsRef?.addEventListener?.('screenschange', handleChange);

      return () => {
        window.removeEventListener('resize', handleChange);
        orientation?.removeEventListener?.('change', handleChange);
        detailsRef?.removeEventListener?.('screenschange', handleChange);
      };
    },

    getCursorPosition(out) {
      ensureCursorTracking();
      out.x = _cursorX;
      out.y = _cursorY;
      return out;
    },

    getModes(screen, out) {
      // Web cannot enumerate display modes; return the current logical mode as the only entry.
      out.length = 1;
      if (out[0] === undefined) out[0] = createScreenMode();
      out[0].width = screen.width;
      out[0].height = screen.height;
      out[0].refreshRate = screen.refreshRate;
      out[0].colorDepth = screen.colorDepth;
      out[0].pixelFormat = '';
      return out;
    },
  };

  return backend;
}

// Stops delivery to `signals` and forgets its subscription. Safe to call when not attached.
export function detachScreenSignals(signals: ScreenSignals): void {
  const unsubscribe = _signalSubscriptions.get(signals);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _signalSubscriptions.delete(signals);
  }
}

// Converts a point from DIP (logical) coordinates to physical screen pixel coordinates relative to
// `screen`'s origin. Alias-safe: `out` may be the same object as `point`.
// physicalX = (point.x - screen.x) * screen.scaleFactor
export function dipToScreenPoint(
  screen: Readonly<ScreenInfo>,
  point: Readonly<Vector2Like>,
  out: { x: number; y: number },
): { x: number; y: number } {
  const px = point.x;
  const py = point.y;
  out.x = (px - screen.x) * screen.scaleFactor;
  out.y = (py - screen.y) * screen.scaleFactor;
  return out;
}

// Converts a rectangle from DIP (logical) coordinates to physical screen pixel coordinates relative
// to `screen`'s origin. Alias-safe: `out` may be the same object as `rect`.
export function dipToScreenRect(
  screen: Readonly<ScreenInfo>,
  rect: Readonly<RectangleLike>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const rx = rect.x;
  const ry = rect.y;
  const rw = rect.width;
  const rh = rect.height;
  const sf = screen.scaleFactor;
  out.x = (rx - screen.x) * sf;
  out.y = (ry - screen.y) * sf;
  out.width = rw * sf;
  out.height = rh * sf;
  return out;
}

// Releases `signals` for garbage collection by detaching its backend subscription. The signals
// remain plain GC-managed memory afterward.
export function disposeScreenSignals(signals: ScreenSignals): void {
  detachScreenSignals(signals);
}

// Enables a signals group for screen change events. Signals stay inert until attachScreenSignals is
// called. This is the opt-in; the cost is paid when attached.
export function enableScreenSignals(): ScreenSignals {
  return createScreenSignals();
}

// Fills `out` with the primary display and returns it. The web reports one screen; a native host its
// OS-designated primary monitor.
export function getPrimaryScreen(out: ScreenInfo): ScreenInfo {
  return getScreenBackend().getPrimaryScreen(out);
}

// The active screen backend, or a lazily-created web default. There is always a backend.
export function getScreenBackend(): ScreenBackend {
  if (_backend === null) _backend = createWebScreenBackend();
  return _backend;
}

// Fills `out` with the bounds rectangle of the given screen. Convenience accessor over the flat fields.
export function getScreenBounds(
  screen: Readonly<ScreenInfo>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  out.x = screen.x;
  out.y = screen.y;
  out.width = screen.width;
  out.height = screen.height;
  return out;
}

// Returns the screen with the given id, or null when no screen matches. Sentinel null means not found.
export function getScreenById(id: number, out: ScreenInfo): ScreenInfo | null {
  const screens: ScreenInfo[] = [];
  getScreens(screens);
  for (const screen of screens) {
    if (screen.id === id) {
      copyScreenInfo(screen, out);
      return out;
    }
  }
  return null;
}

// Returns the screen whose bounds contain the given rectangle (largest-overlap strategy). Falls back
// to the screen nearest to the rectangle's center when no screen contains it.
export function getScreenContainingRect(rect: Readonly<RectangleLike>, out: ScreenInfo): ScreenInfo {
  const screens: ScreenInfo[] = [];
  getScreens(screens);
  if (screens.length === 0) {
    fillDefaultScreenInfo(out);
    return out;
  }

  let bestScreen = screens[0];
  let bestOverlap = -1;

  for (const screen of screens) {
    const ox = Math.max(0, Math.min(rect.x + rect.width, screen.x + screen.width) - Math.max(rect.x, screen.x));
    const oy = Math.max(0, Math.min(rect.y + rect.height, screen.y + screen.height) - Math.max(rect.y, screen.y));
    const overlap = ox * oy;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestScreen = screen;
    }
  }

  // No overlap — fall back to nearest by center distance.
  if (bestOverlap <= 0) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    let bestDist = Infinity;
    for (const screen of screens) {
      const scx = screen.x + screen.width / 2;
      const scy = screen.y + screen.height / 2;
      const dx = cx - scx;
      const dy = cy - scy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestScreen = screen;
      }
    }
  }

  copyScreenInfo(bestScreen, out);
  return out;
}

// Fills `out` with the current-mode for the given screen (the active resolution/refresh pair).
// Web returns a synthetic single-entry mode derived from ScreenInfo fields.
export function getScreenCurrentMode(screen: Readonly<ScreenInfo>, out: ScreenMode): ScreenMode {
  out.width = screen.width;
  out.height = screen.height;
  out.refreshRate = screen.refreshRate;
  out.colorDepth = screen.colorDepth;
  out.pixelFormat = '';
  return out;
}

// Fills `out` with the current cursor position in virtual-desktop coordinates and returns it.
// Uses the active backend's getCursorPosition. Returns (0, 0) before the first pointermove (web)
// or when unavailable.
export function getScreenCursorPosition(out: { x: number; y: number }): { x: number; y: number } {
  return getScreenBackend().getCursorPosition(out);
}

// Returns the screen currently containing the cursor. Composites getScreenCursorPosition with
// getScreenNearestPoint.
export function getScreenCursorScreen(out: ScreenInfo): ScreenInfo {
  const pos = _scratchPoint;
  getScreenCursorPosition(pos);
  return getScreenNearestPoint(pos, out);
}

// Returns the permission state for the Window Management API (multi-monitor on web).
// 'granted' | 'denied' | 'prompt' mirrors the PermissionState vocabulary.
// Returns 'prompt' when the Permissions API is unavailable.
export async function getScreenDetailPermission(): Promise<'denied' | 'granted' | 'prompt'> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) return 'prompt';
  try {
    const status = await navigator.permissions.query({
      name: 'window-management' as PermissionName,
    });
    return status.state as 'denied' | 'granted' | 'prompt';
  } catch {
    return 'prompt';
  }
}

// Fills `out` with all available display modes for the given screen. Web returns a single synthetic
// entry derived from the screen's current fields.
export function getScreenModes(screen: Readonly<ScreenInfo>, out: ScreenMode[]): ScreenMode[] {
  const backend = getScreenBackend();
  if (backend.getModes !== undefined) {
    return backend.getModes(screen, out);
  }
  // Fallback: a single synthetic mode from the screen's current fields.
  out.length = 1;
  if (out[0] === undefined) out[0] = createScreenMode();
  getScreenCurrentMode(screen, out[0]);
  return out;
}

// Returns the screen whose bounds contain `point` (virtual-desktop coordinates). Falls back to the
// closest screen by Euclidean distance when the point lies outside all screens.
export function getScreenNearestPoint(point: Readonly<Vector2Like>, out: ScreenInfo): ScreenInfo {
  const screens: ScreenInfo[] = [];
  getScreens(screens);
  if (screens.length === 0) {
    fillDefaultScreenInfo(out);
    return out;
  }

  // Prefer the screen that contains the point.
  for (const screen of screens) {
    if (
      point.x >= screen.x &&
      point.x < screen.x + screen.width &&
      point.y >= screen.y &&
      point.y < screen.y + screen.height
    ) {
      copyScreenInfo(screen, out);
      return out;
    }
  }

  // Fall back to the nearest screen by distance from point to screen center.
  let bestScreen = screens[0];
  let bestDist = Infinity;
  for (const screen of screens) {
    const cx = screen.x + screen.width / 2;
    const cy = screen.y + screen.height / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestScreen = screen;
    }
  }

  copyScreenInfo(bestScreen, out);
  return out;
}

// Returns the screen whose bounds contain `rect` by largest overlap, falling back to nearest by
// center distance. This is Electron's getDisplayMatching behavior.
export function getScreenNearestRect(rect: Readonly<RectangleLike>, out: ScreenInfo): ScreenInfo {
  return getScreenContainingRect(rect, out);
}

// Fills `out` with every attached display and returns it. out.length is set to the screen count;
// missing slots are allocated. On the web this is a single screen; an empty array when no window.
export function getScreens(out: ScreenInfo[]): ScreenInfo[] {
  return getScreenBackend().getScreens(out);
}

// Fills `out` with the work-area rectangle of the given screen (excluding OS chrome).
export function getScreenWorkArea(
  screen: Readonly<ScreenInfo>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  out.x = screen.x;
  out.y = screen.y;
  out.width = screen.workWidth;
  out.height = screen.workHeight;
  return out;
}

// Subscribes to display change events via the active backend; returns an unsubscribe.
// Each event carries the affected ScreenInfo and the ScreenChangeKind, plus changedMetrics for
// ScreenMetricsChanged events.
export function onScreenChange(listener: (event: Readonly<ScreenChangeEvent>) => void): () => void {
  return getScreenBackend().subscribe(listener);
}

// Watches the Window Management permission for later grant/revoke and invokes `listener` with the
// new state on each change. Backed by the Permissions API PermissionStatus change event, so it
// reflects a grant/revoke made outside this call (browser UI, another tab) without polling.
// Returns a no-op unsubscribe when the Permissions API is unavailable (SSR, jsdom, non-Chromium)
// or the query rejects — matching getScreenDetailPermission's sentinel discipline.
export function onScreenDetailPermissionChange(listener: (state: 'denied' | 'granted' | 'prompt') => void): () => void {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) return () => {};
  let status: PermissionStatus | null = null;
  let cancelled = false;
  const handleChange = () => {
    if (status !== null) listener(status.state as 'denied' | 'granted' | 'prompt');
  };
  navigator.permissions
    .query({ name: 'window-management' as PermissionName })
    .then((s) => {
      if (cancelled) return;
      status = s;
      s.addEventListener('change', handleChange);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    status?.removeEventListener('change', handleChange);
  };
}

// Invalidates the backend's cached enumeration so the next getScreens / getPrimaryScreen call reads
// fresh data. Call after a known reconfiguration (e.g. when the backend fires a change event but
// the application needs to force-refresh before the next natural poll).
export function refreshScreens(): void {
  // The web backend re-reads window.screen on every call; no explicit invalidation needed.
  // Native backends should override this via the backend seam if they cache internally.
  // This function is a hook: calling it is always safe.
}

// Requests the Window Management permission and, if granted, upgrades the active web backend to
// expose all attached screens via the Screen Details API. Returns true when permission is granted
// and the multi-monitor view is active. Returns false in environments where the API is unavailable
// (SSR, jsdom, non-Chromium browsers) or when the user denies the request.
//
// After this returns true, getScreens() enumerates from ScreenDetails.screens and refreshRate is
// populated from ScreenDetailed.refreshRate. The active backend must be the web backend (created by
// createWebScreenBackend); calling this when a native host backend is installed is a no-op (native
// backends provide multi-monitor natively without a permission grant).
export async function requestScreenDetails(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const win = window as Window & { getScreenDetails?: () => Promise<unknown> };
  if (typeof win.getScreenDetails !== 'function') return false;
  try {
    const details = await win.getScreenDetails();
    // Upgrade the active backend if it is a web backend (has the internal _upgrade hook).
    const b = getScreenBackend() as ScreenBackend & { _upgrade?: (d: unknown) => void };
    b._upgrade?.(details);
    return true;
  } catch {
    return false;
  }
}

// Converts a point from physical screen pixel coordinates (relative to `screen`'s origin) to DIP
// (logical) coordinates. Alias-safe: `out` may be the same object as `point`.
// dipX = point.x / screen.scaleFactor + screen.x
export function screenToDipPoint(
  screen: Readonly<ScreenInfo>,
  point: Readonly<Vector2Like>,
  out: { x: number; y: number },
): { x: number; y: number } {
  const px = point.x;
  const py = point.y;
  out.x = px / screen.scaleFactor + screen.x;
  out.y = py / screen.scaleFactor + screen.y;
  return out;
}

// Converts a rectangle from physical screen pixel coordinates to DIP (logical) coordinates.
// Alias-safe: `out` may be the same object as `rect`.
export function screenToDipRect(
  screen: Readonly<ScreenInfo>,
  rect: Readonly<RectangleLike>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const rx = rect.x;
  const ry = rect.y;
  const rw = rect.width;
  const rh = rect.height;
  const sf = screen.scaleFactor;
  out.x = rx / sf + screen.x;
  out.y = ry / sf + screen.y;
  out.width = rw / sf;
  out.height = rh / sf;
  return out;
}

// Installs a native host screen backend; pass null to fall back to the web default.
export function setScreenBackend(backend: ScreenBackend | null): void {
  _backend = backend;
}

let _backend: ScreenBackend | null = null;
const _signalSubscriptions = new WeakMap<ScreenSignals, () => void>();
const _scratchPoint = { x: 0, y: 0 };

// Copies all fields from src to dst.
function copyScreenInfo(src: Readonly<ScreenInfo>, dst: ScreenInfo): void {
  dst.id = src.id;
  dst.x = src.x;
  dst.y = src.y;
  dst.width = src.width;
  dst.height = src.height;
  dst.workWidth = src.workWidth;
  dst.workHeight = src.workHeight;
  dst.scaleFactor = src.scaleFactor;
  dst.isPrimary = src.isPrimary;
  dst.rotation = src.rotation;
  dst.orientation = src.orientation;
  dst.refreshRate = src.refreshRate;
  dst.colorDepth = src.colorDepth;
  dst.pixelDepth = src.pixelDepth;
  dst.physicalWidth = src.physicalWidth;
  dst.physicalHeight = src.physicalHeight;
  dst.isHdr = src.isHdr;
  dst.colorSpace = src.colorSpace;
  dst.maxLuminance = src.maxLuminance;
  dst.depthPerComponent = src.depthPerComponent;
  dst.dpi = src.dpi;
  dst.label = src.label;
  dst.internal = src.internal;
  dst.touchSupport = src.touchSupport;
  dst.monochrome = src.monochrome;
}

// Returns a ScreenChangedMetrics diff between two ScreenInfo snapshots, or null when nothing changed.
function diffScreenInfo(prev: Readonly<ScreenInfo>, curr: Readonly<ScreenInfo>): ScreenChangedMetrics | null {
  const boundsChanged =
    prev.x !== curr.x || prev.y !== curr.y || prev.width !== curr.width || prev.height !== curr.height;
  const workAreaChanged = prev.workWidth !== curr.workWidth || prev.workHeight !== curr.workHeight;
  const scaleChanged = prev.scaleFactor !== curr.scaleFactor;
  const orientationChanged = prev.rotation !== curr.rotation || prev.orientation !== curr.orientation;

  if (!boundsChanged && !workAreaChanged && !scaleChanged && !orientationChanged) return null;
  return {
    bounds: boundsChanged,
    workArea: workAreaChanged,
    scaleFactor: scaleChanged,
    orientation: orientationChanged,
  };
}

function fillDefaultScreenInfo(out: ScreenInfo): void {
  out.id = 0;
  out.x = 0;
  out.y = 0;
  out.width = 0;
  out.height = 0;
  out.workWidth = 0;
  out.workHeight = 0;
  out.scaleFactor = 1;
  out.isPrimary = false;
  out.rotation = -1;
  out.orientation = 'Landscape';
  out.refreshRate = -1;
  out.colorDepth = -1;
  out.pixelDepth = -1;
  out.physicalWidth = -1;
  out.physicalHeight = -1;
  out.isHdr = false;
  out.colorSpace = 'srgb';
  out.maxLuminance = -1;
  out.depthPerComponent = -1;
  out.dpi = -1;
  out.label = '';
  out.internal = false;
  out.touchSupport = 'unknown';
  out.monochrome = false;
}

interface WebScreenOrientationObject {
  angle?: number;
  type?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function getWebColorSpace(): ScreenColorSpace {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'srgb';
  if (window.matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
  if (window.matchMedia('(color-gamut: p3)').matches) return 'display-p3';
  return 'srgb';
}

function getWebIsHdr(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(dynamic-range: high)').matches;
}

function getWebOrientation(): ScreenOrientation {
  const obj = getWebScreenOrientationObject();
  const type = obj?.type ?? '';
  if (type.startsWith('portrait-primary')) return 'Portrait';
  if (type.startsWith('portrait-secondary')) return 'PortraitFlipped';
  if (type.startsWith('landscape-secondary')) return 'LandscapeFlipped';
  return 'Landscape';
}

function getWebRotation(): number {
  const obj = getWebScreenOrientationObject();
  const angle = obj?.angle;
  if (typeof angle === 'number') return angle;
  return -1;
}

function getWebScreenOrientationObject(): WebScreenOrientationObject | null {
  if (typeof window === 'undefined' || typeof window.screen === 'undefined') return null;
  const s = window.screen as Screen & { orientation?: WebScreenOrientationObject };
  return s.orientation ?? null;
}
