import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  StatusBar,
  StatusBarAnimation,
  StatusBarBackend,
  StatusBarInfo,
  StatusBarStyle,
  StatusBarStyleEntry,
  StatusBarStyleEntryHandle,
} from '@flighthq/types';

// Begins delivering OS-driven status bar changes to `bar`'s signals by subscribing to the active
// backend. Idempotent: a prior subscription is torn down first. Pair with detachStatusBar /
// disposeStatusBar.
export function attachStatusBar(bar: StatusBar): void {
  detachStatusBar(bar);
  const backend = getStatusBarBackend();
  const unsubscribe = backend.subscribe(() => {
    const info = backend.getInfo(_scratchInfo);
    emitSignal(bar.onChange, info);
  });
  _subscriptions.set(bar, unsubscribe);
}

// Allocates a StatusBar event entity with inert signals; call attachStatusBar to start delivery.
export function createStatusBar(): StatusBar {
  return {
    onChange: createSignal(),
  };
}

// Allocates a zeroed StatusBarInfo, suitable as the `out` for getStatusBarInfo.
// height defaults to -1 (unknown), color to 0 (transparent black), style to 'default'.
export function createStatusBarInfo(): StatusBarInfo {
  return {
    color: 0,
    height: -1,
    overlaysContent: false,
    style: 'default',
    visible: true,
  };
}

// Builds the default web backend. Web pages have no true status bar, so only setBackgroundColor does
// anything observable: it upserts a <meta name="theme-color"> hint (alpha dropped). The rest no-op
// until a native host registers a backend. getInfo reads from the current theme-color meta where
// present and returns safe defaults for fields the web cannot know (height = -1, visible = true).
export function createWebStatusBarBackend(): StatusBarBackend {
  return {
    getInfo(out: StatusBarInfo): StatusBarInfo {
      // Read back the theme-color meta if present; otherwise 0 (no hint set).
      out.color = _webReadThemeColor();
      out.height = -1;
      out.overlaysContent = false;
      out.style = 'default';
      out.visible = true;
      return out;
    },
    setBackgroundColor(color: number, _animated?: boolean): void {
      // Derive #rrggbb from the top 24 bits of the packed RGBA integer; alpha is dropped.
      if (typeof document === 'undefined') return;
      const head = document.head;
      if (head === null || head === undefined) return;
      let meta = head.querySelector('meta[name="theme-color"]');
      if (meta === null) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        head.appendChild(meta);
      }
      meta.setAttribute('content', packedRgbaToHexColor(color));
    },
    setOverlaysContent(_overlay: boolean): void {
      // No web status bar; a native host is required to control content overlay.
    },
    setStyle(_style: StatusBarStyle): void {
      // No web status bar; a native host (Capacitor/native shell) is required to honor style.
    },
    setVisible(_visible: boolean, _animation?: StatusBarAnimation): void {
      // No web status bar; a native host is required to show/hide it.
    },
    subscribe(_listener: () => void): () => void {
      // No OS-driven status bar events on web; return a no-op unsubscribe.
      return () => {};
    },
  };
}

// Stops delivery to `bar` and forgets its subscription. Safe to call when not attached.
export function detachStatusBar(bar: StatusBar): void {
  const unsubscribe = _subscriptions.get(bar);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(bar);
  }
}

// Releases `bar` for garbage collection by detaching its backend subscription. The signals remain
// plain GC-managed memory afterward.
export function disposeStatusBar(bar: StatusBar): void {
  detachStatusBar(bar);
}

// Enables status bar signals for use with attachStatusBar/detachStatusBar. This is a no-op for
// the import itself; it documents the explicit opt-in point for the signal infrastructure.
export function enableStatusBarSignals(): void {
  // Signals are always available via @flighthq/signals; this function is the explicit opt-in
  // marker callers use to document intent, and a hook point for future setup if needed.
}

// The active status bar backend, or a lazily-created web default. There is always a backend.
export function getStatusBarBackend(): StatusBarBackend {
  if (_backend === null) _backend = createWebStatusBarBackend();
  return _backend;
}

// Returns the status bar height in CSS pixels, or -1 when the host does not report it (web,
// desktops). Convenience over getStatusBarInfo.
// NOTE: On notched/island devices, the safe-area top inset (owned by @flighthq/device) may differ
// from the status bar height. Use device.getSafeAreaInsets().top for layout-safe top padding;
// use getStatusBarHeight() when you specifically need the status bar element's intrinsic height.
export function getStatusBarHeight(): number {
  return getStatusBarBackend().getInfo(_scratchInfo).height;
}

// Fills `out` with the current status bar state snapshot and returns it. Alias-safe: `out` may
// be the same object as any internal scratch.
export function getStatusBarInfo(out: StatusBarInfo): StatusBarInfo {
  return getStatusBarBackend().getInfo(out);
}

// Removes the style stack entry identified by `handle`. If the handle is unknown or invalid,
// this is a no-op. The top entry (or baseline) is re-applied after removal.
export function popStatusBarStyleEntry(handle: StatusBarStyleEntryHandle): void {
  if (handle === INVALID_HANDLE) return;
  const idx = _styleStack.findIndex((e) => e.handle === handle);
  if (idx === -1) return;
  _styleStack.splice(idx, 1);
  _applyTopStyleEntry();
}

// Pushes a style stack entry, returns an opaque handle for later pop. Nested components can push
// entries and restore the previous state on unmount without global last-write-wins clashes.
// Unset fields fall through to the next entry down the stack (last pushed wins per field).
export function pushStatusBarStyleEntry(entry: Readonly<StatusBarStyleEntry>): StatusBarStyleEntryHandle {
  const handle = _nextHandle++;
  _styleStack.push({ handle, entry });
  _applyTopStyleEntry();
  return handle;
}

// Installs a native host status bar backend; pass null to fall back to the web default.
export function setStatusBarBackend(backend: StatusBarBackend | null): void {
  _backend = backend;
}

// Sets the status bar background color from a packed RGBA integer (0xRRGGBBAA). On web this
// updates the theme-color hint; alpha is ignored. Set animated to true for a smooth transition
// (native hosts only; no-op on web).
export function setStatusBarColor(color: number, animated?: boolean): void {
  getStatusBarBackend().setBackgroundColor(color, animated);
}

// Controls whether content draws under the status bar. No-op on web.
export function setStatusBarOverlaysContent(overlay: boolean): void {
  getStatusBarBackend().setOverlaysContent(overlay);
}

// Sets the status bar foreground style ('light' | 'dark' | 'default'). No-op on web.
export function setStatusBarStyle(style: StatusBarStyle): void {
  getStatusBarBackend().setStyle(style);
}

// Shows or hides the status bar. animation controls the transition; defaults to 'none'. No-op on web.
export function setStatusBarVisible(visible: boolean, animation?: StatusBarAnimation): void {
  getStatusBarBackend().setVisible(visible, animation);
}

// ---- module-level state ----

let _backend: StatusBarBackend | null = null;
let _nextHandle: StatusBarStyleEntryHandle = 1;
const _scratchInfo: StatusBarInfo = createStatusBarInfo();
const _styleStack: { handle: StatusBarStyleEntryHandle; entry: Readonly<StatusBarStyleEntry> }[] = [];
const _subscriptions = new WeakMap<StatusBar, () => void>();

const INVALID_HANDLE: StatusBarStyleEntryHandle = -1;

// Merges the style stack top-down (last pushed = highest priority per field) and applies the
// merged result to the active backend. Falls through to no-ops where no entry sets a field.
function _applyTopStyleEntry(): void {
  const backend = getStatusBarBackend();
  let style: StatusBarStyle | undefined;
  let visible: boolean | undefined;
  let color: number | undefined;
  let overlaysContent: boolean | undefined;
  let animation: StatusBarAnimation | undefined;
  // Stack is in push order; iterate from last pushed (top) to earliest (bottom).
  for (let i = _styleStack.length - 1; i >= 0; i--) {
    const e = _styleStack[i].entry;
    if (style === undefined && e.style !== undefined) style = e.style;
    if (visible === undefined && e.visible !== undefined) visible = e.visible;
    if (color === undefined && e.color !== undefined) color = e.color;
    if (overlaysContent === undefined && e.overlaysContent !== undefined) overlaysContent = e.overlaysContent;
    if (animation === undefined && e.animation !== undefined) animation = e.animation;
  }
  if (style !== undefined) backend.setStyle(style);
  if (visible !== undefined) backend.setVisible(visible, animation ?? 'none');
  if (color !== undefined) backend.setBackgroundColor(color, false);
  if (overlaysContent !== undefined) backend.setOverlaysContent(overlaysContent);
}

function packedRgbaToHexColor(color: number): string {
  const rgb = (color >>> 8) & 0xffffff;
  return '#' + rgb.toString(16).padStart(6, '0');
}

// Reads the current theme-color meta content and parses it back to a packed RGBA integer.
// Returns 0 if no meta is present or the value cannot be parsed.
function _webReadThemeColor(): number {
  if (typeof document === 'undefined') return 0;
  const meta = document.head?.querySelector('meta[name="theme-color"]');
  if (meta === null || meta === undefined) return 0;
  const content = meta.getAttribute('content');
  if (content === null || !content.startsWith('#')) return 0;
  const hex = content.slice(1);
  if (hex.length !== 6) return 0;
  const rgb = parseInt(hex, 16);
  if (isNaN(rgb)) return 0;
  // Reconstruct as 0xRRGGBBFF (alpha fully opaque since web drops alpha).
  return ((rgb << 8) | 0xff) >>> 0;
}
