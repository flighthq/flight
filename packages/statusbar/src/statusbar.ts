import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  BackendExplanation,
  StatusBar,
  StatusBarAnimation,
  StatusBarBackend,
  StatusBarInfo,
  StatusBarStyle,
  StatusBarStyleEntry,
  StatusBarStyleEntryHandle,
} from '@flighthq/types/contract';

// Begins delivering OS-driven status bar changes to `bar`'s signals by subscribing to the active
// backend. Idempotent: a prior subscription is torn down first. Pair with detachStatusBar /
// disposeStatusBar.
//
// Each event carries a freshly allocated StatusBarInfo the listener owns outright. This is the one
// place in the package that deliberately allocates per event rather than filling a shared scratch:
// an emitted payload is retained by whoever listens, and a shared scratch would let the next event —
// or an unrelated getStatusBarHeight() call — rewrite a snapshot a listener had already stored, and
// would hand every attached bar the same object. Status bar changes are rare OS events, so the
// allocation is not on any hot path; a caller that wants zero-allocation reads uses getStatusBarInfo
// with its own `out`.
export function attachStatusBar(bar: StatusBar): void {
  detachStatusBar(bar);
  const backend = getStatusBarBackend();
  const unsubscribe = backend.subscribe(() => {
    emitSignal(bar.onChange, backend.getInfo(createStatusBarInfo()));
  });
  _subscriptions.set(bar, unsubscribe);
}

// Empties the style stack and restores the status bar to the state it held before the first entry
// was pushed. The counterpart to pushStatusBarStyleEntry for whole-screen teardown, where popping
// each handle individually would mean tracking them all. A no-op on an empty stack.
export function clearStatusBarStyleStack(): void {
  if (_styleStack.length === 0) return;
  _styleStack.length = 0;
  _applyTopStyleEntry();
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

export function explainStatusBarBackend(): BackendExplanation {
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

// The active status bar backend. Precedence: custom > host > sentinel.
export function getStatusBarBackend(): StatusBarBackend {
  return _custom ?? _host ?? _sentinel;
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

// True when `handle` names an entry still on the style stack. False for a popped handle, an unknown
// one, or the invalid handle — so a component can check before popping without tracking its own
// mounted flag.
export function hasStatusBarStyleEntry(handle: StatusBarStyleEntryHandle): boolean {
  if (handle === INVALID_HANDLE) return false;
  return _styleStack.some((e) => e.handle === handle);
}

export function installStatusBarHostBackend(backend: StatusBarBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeStatusBarHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Converts a packed RGBA integer (0xRRGGBBAA) to a #rrggbb hex string, dropping alpha.
export function packedRgbaToHexColor(color: number): string {
  const rgb = (color >>> 8) & 0xffffff;
  return '#' + rgb.toString(16).padStart(6, '0');
}

// Removes the style stack entry identified by `handle`. If the handle is unknown or invalid,
// this is a no-op. The remaining stack — falling back to the baseline captured before the first
// push — is re-applied after removal, so a field the popped entry was the last to set returns to
// what it was rather than staying where that entry left it.
export function popStatusBarStyleEntry(handle: StatusBarStyleEntryHandle): void {
  if (handle === INVALID_HANDLE) return;
  const idx = _styleStack.findIndex((e) => e.handle === handle);
  if (idx === -1) return;
  _styleStack.splice(idx, 1);
  _applyTopStyleEntry();
}

// Pushes a style stack entry, returns an opaque handle for later pop. Nested components can push
// entries and restore the previous state on unmount without global last-write-wins clashes.
// Unset fields fall through to the next entry down the stack (last pushed wins per field), and
// through an empty stack to the baseline.
//
// The baseline is read from the backend when the stack goes from empty to non-empty — the last
// moment it still describes the pre-stack status bar. Capturing it at module load would be wrong
// (no backend is installed yet) and re-reading it per push would capture the stack's own effect.
export function pushStatusBarStyleEntry(entry: Readonly<StatusBarStyleEntry>): StatusBarStyleEntryHandle {
  if (_styleStack.length === 0) {
    _baseline = getStatusBarBackend().getInfo(createStatusBarInfo());
    // `_applied` starts as a copy of the baseline, not null, so the first push only calls setters for
    // fields it actually changes rather than restating the baseline back to the backend.
    _applied = getStatusBarBackend().getInfo(createStatusBarInfo());
  }
  const handle = _nextHandle++;
  _styleStack.push({ handle, entry });
  _applyTopStyleEntry();
  return handle;
}

export function resetStatusBarBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Installs a custom status bar backend; pass null to clear the custom override.
export function setStatusBarBackend(backend: StatusBarBackend | null): void {
  _custom = backend;
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

const _sentinel: StatusBarBackend = {
  getInfo(out: StatusBarInfo): StatusBarInfo {
    out.color = 0;
    out.height = -1;
    out.overlaysContent = false;
    out.style = 'default';
    out.visible = true;
    return out;
  },
  setBackgroundColor(): void {},
  setOverlaysContent(): void {},
  setStyle(): void {},
  setVisible(): void {},
  subscribe(): () => void {
    return () => {};
  },
};
let _custom: StatusBarBackend | null = null;
let _host: StatusBarBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
let _nextHandle: StatusBarStyleEntryHandle = 1;
const _scratchInfo: StatusBarInfo = createStatusBarInfo();
const _styleStack: { handle: StatusBarStyleEntryHandle; entry: Readonly<StatusBarStyleEntry> }[] = [];
const _subscriptions = new WeakMap<StatusBar, () => void>();

// The status bar as it stood before the stack's first entry, and the state the stack has actually
// pushed to the backend. Together they make pop a restore rather than a no-op: `_baseline` supplies
// the value a released field returns to, and `_applied` keeps the backend from being told things it
// already knows. Both are cleared when the stack empties, so the next push re-reads a baseline that
// is once again the pre-stack truth.
let _baseline: StatusBarInfo | null = null;
let _applied: StatusBarInfo | null = null;

const INVALID_HANDLE: StatusBarStyleEntryHandle = -1;

// Merges the style stack top-down (last pushed = highest priority per field), falls unset fields
// through to the captured baseline, and pushes to the backend only what actually changed.
//
// The baseline fallback is what makes a pop restore: merging the stack alone leaves a released field
// undefined, and an undefined field used to mean "call no setter", which left the OS holding the
// value of an entry that is no longer on the stack. Diffing against `_applied` keeps that fix from
// costing a burst of redundant setter calls on every push and pop.
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

  const baseline = _baseline;
  if (baseline !== null) {
    if (style === undefined) style = baseline.style;
    if (visible === undefined) visible = baseline.visible;
    if (color === undefined) color = baseline.color;
    if (overlaysContent === undefined) overlaysContent = baseline.overlaysContent;
  }

  const applied = _applied;
  if (style !== undefined && style !== applied?.style) backend.setStyle(style);
  if (visible !== undefined && visible !== applied?.visible) backend.setVisible(visible, animation ?? 'none');
  if (color !== undefined && color !== applied?.color) backend.setBackgroundColor(color, false);
  if (overlaysContent !== undefined && overlaysContent !== applied?.overlaysContent) {
    backend.setOverlaysContent(overlaysContent);
  }

  if (_styleStack.length === 0) {
    // The stack is spent: the backend is back at the baseline, so forget both and let the next push
    // capture a fresh one.
    _baseline = null;
    _applied = null;
    return;
  }
  const next = _applied ?? createStatusBarInfo();
  if (style !== undefined) next.style = style;
  if (visible !== undefined) next.visible = visible;
  if (color !== undefined) next.color = color;
  if (overlaysContent !== undefined) next.overlaysContent = overlaysContent;
  _applied = next;
}
