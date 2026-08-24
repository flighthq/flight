import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  BackendExplanation,
  SoftKeyboard,
  SoftKeyboardBackend,
  SoftKeyboardInfo,
  SoftKeyboardPhase,
  SoftKeyboardResizeMode,
  SoftKeyboardStyleKind,
  SoftKeyboardTransition,
} from '@flighthq/types/contract';
import { SoftKeyboardResizeNoneKind } from '@flighthq/types/contract';

// Begins delivering on-screen keyboard changes to `keyboard`'s signals by subscribing to the active
// backend. On each change it reads fresh info, emits will/did signal pairs (with onShow/onHide/onResize
// aliases firing alongside the did-phase edge), and tracks visibility-edge transitions for
// onWillShow/onWillHide and onDidShow/onDidHide pairs. Idempotent: a prior subscription is torn
// down first. Pair with detachSoftKeyboard/disposeSoftKeyboard.
export function attachSoftKeyboard(keyboard: SoftKeyboard): void {
  detachSoftKeyboard(keyboard);
  const backend = getSoftKeyboardBackend();
  let wasVisible = backend.getInfo(_scratch).visible;
  const unsubscribe = backend.subscribe((phase: SoftKeyboardPhase, transition: Readonly<SoftKeyboardTransition>) => {
    const prevVisible = wasVisible;
    const info = backend.getInfo(_scratch);
    const nowVisible = info.visible;
    if (phase === 'will') {
      // Will-phase: emit will-signals before animation begins.
      if (nowVisible && !prevVisible) {
        emitSignal(keyboard.onWillShow, transition);
      } else if (!nowVisible && prevVisible) {
        emitSignal(keyboard.onWillHide, transition);
      } else {
        emitSignal(keyboard.onWillResize, transition);
      }
    } else {
      // Did-phase: emit did-signals (and simple-path aliases) after animation ends.
      emitSignal(keyboard.onDidResize, info.height);
      emitSignal(keyboard.onResize, info.height);
      if (nowVisible !== prevVisible) {
        wasVisible = nowVisible;
        if (nowVisible) {
          emitSignal(keyboard.onDidShow, info.height);
          emitSignal(keyboard.onShow, info.height);
        } else {
          emitSignal(keyboard.onDidHide);
          emitSignal(keyboard.onHide);
        }
      }
    }
  });
  _subscriptions.set(keyboard, unsubscribe);
}

// Allocates a SoftKeyboard event entity with inert signals; call attachSoftKeyboard to start delivery.
export function createSoftKeyboard(): SoftKeyboard {
  return {
    onShow: createSignal(),
    onHide: createSignal(),
    onResize: createSignal(),
    onWillShow: createSignal(),
    onWillHide: createSignal(),
    onWillResize: createSignal(),
    onDidShow: createSignal(),
    onDidHide: createSignal(),
    onDidResize: createSignal(),
  };
}

// Allocates a zeroed SoftKeyboardInfo, suitable as the `out` for getSoftKeyboardInfo.
export function createSoftKeyboardInfo(): SoftKeyboardInfo {
  return { visible: false, height: 0, x: 0, y: 0, width: 0 };
}

// Allocates a zeroed SoftKeyboardTransition with durationSeconds 0 and height 0.
export function createSoftKeyboardTransition(): SoftKeyboardTransition {
  return { durationSeconds: 0, height: 0 };
}

// Builds the default web backend over window.visualViewport, inferring keyboard height from the
// viewport shrink relative to window.innerHeight. Also uses the Chromium VirtualKeyboard API
// (navigator.virtualKeyboard) when available: geometry comes from geometrychange, and
// showSoftKeyboard/hideSoftKeyboard become real operations instead of no-ops.
// Degrades to height 0 and a no-op subscription where the API is absent. All did-phase only
// (durationSeconds: 0); native backends may emit will-phase with timing.
export function createWebSoftKeyboardBackend(): SoftKeyboardBackend {
  return {
    getInfo(out) {
      const geo = getWebKeyboardGeometry();
      out.height = geo.height;
      out.visible = geo.height > 0;
      out.x = geo.x;
      out.y = geo.y;
      out.width = geo.width;
      return out;
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};
      // transition.height stays 0 on web: this backend fires the 'did' phase only, where consumers
      // read the settled geometry from getInfo(); the will-phase target height that transition.height
      // is meant to carry is animation metadata the web viewport APIs never expose. Native hosts that
      // emit a real 'will' phase must populate transition.height with the incoming keyboard height.
      const transition: SoftKeyboardTransition = { durationSeconds: 0, height: 0 };
      const fire = () => listener('did', transition);
      // Use Chromium VirtualKeyboard API when available for geometry.
      const virtualKeyboard = getVirtualKeyboard();
      if (virtualKeyboard !== null) {
        virtualKeyboard.addEventListener('geometrychange', fire);
        return () => virtualKeyboard.removeEventListener('geometrychange', fire);
      }
      // Fall back to visualViewport resize/scroll.
      const viewport = window.visualViewport;
      if (viewport === undefined || viewport === null) return () => {};
      viewport.addEventListener('resize', fire);
      viewport.addEventListener('scroll', fire);
      return () => {
        viewport.removeEventListener('resize', fire);
        viewport.removeEventListener('scroll', fire);
      };
    },
    show() {
      const vk = getVirtualKeyboard();
      if (vk !== null) {
        vk.show();
      }
      // No-op on web without VirtualKeyboard API; the soft keyboard only opens when a field is focused.
    },
    hide() {
      const vk = getVirtualKeyboard();
      if (vk !== null) {
        vk.hide();
      }
      // No-op on web without VirtualKeyboard API.
    },
  };
}

// Stops delivery to `keyboard` and forgets its subscription. Safe to call when not attached.
export function detachSoftKeyboard(keyboard: SoftKeyboard): void {
  const unsubscribe = _subscriptions.get(keyboard);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(keyboard);
  }
}

// Releases `keyboard` for garbage collection by detaching its backend subscription. The signals
// remain plain GC-managed memory afterward.
export function disposeSoftKeyboard(keyboard: SoftKeyboard): void {
  detachSoftKeyboard(keyboard);
}

export function explainSoftKeyboardBackend(): BackendExplanation {
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

// The active soft keyboard backend. Precedence: custom > host > sentinel.
export function getSoftKeyboardBackend(): SoftKeyboardBackend {
  return _custom ?? _host ?? _sentinel;
}

// Returns the current on-screen keyboard height in CSS pixels without allocating. 0 when hidden.
export function getSoftKeyboardHeight(): number {
  return getSoftKeyboardBackend().getInfo(_scratch).height;
}

// Fills `out` with the current on-screen keyboard snapshot and returns it.
export function getSoftKeyboardInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
  return getSoftKeyboardBackend().getInfo(out);
}

// Returns the current keyboard resize mode. Delegates to the backend; returns
// SoftKeyboardResizeNoneKind when the backend does not support resize-mode queries.
export function getSoftKeyboardResizeMode(): SoftKeyboardResizeMode {
  const backend = getSoftKeyboardBackend();
  return backend.getResizeMode?.() ?? SoftKeyboardResizeNoneKind;
}

// Requests that the host dismiss the on-screen keyboard. A no-op on web unless the
// navigator.virtualKeyboard API is available (Chromium with virtualKeyboard policy).
export function hideSoftKeyboard(): void {
  getSoftKeyboardBackend().hide();
}

export function installSoftKeyboardHostBackend(backend: SoftKeyboardBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

// Returns whether the input accessory bar (iOS toolbar above the keyboard) is visible.
// Returns false when the backend does not support this query.
export function isSoftKeyboardAccessoryBarVisible(): boolean {
  return getSoftKeyboardBackend().getAccessoryBarVisible?.() ?? false;
}

// Returns whether scroll-assist is enabled. Returns false when the backend does not support this.
export function isSoftKeyboardScrollAssistEnabled(): boolean {
  return getSoftKeyboardBackend().getScrollAssistEnabled?.() ?? false;
}

export function observeSoftKeyboardHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetSoftKeyboardBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Controls whether the iOS input accessory bar (the toolbar above the keyboard) is visible.
// No-op when the backend does not support this.
export function setSoftKeyboardAccessoryBarVisible(visible: boolean): void {
  getSoftKeyboardBackend().setAccessoryBarVisible?.(visible);
}

// Installs a custom soft keyboard backend; takes precedence over the host backend.
export function setSoftKeyboardBackend(backend: SoftKeyboardBackend | null): void {
  _custom = backend;
}

// Controls keyboard resize behavior — how the app viewport reacts when the keyboard appears.
// No-op when the backend does not support resize-mode control.
export function setSoftKeyboardResizeMode(mode: SoftKeyboardResizeMode): void {
  getSoftKeyboardBackend().setResizeMode?.(mode);
}

// Controls whether the keyboard scroll-assist feature is enabled (scrolls the focused field into
// view when the keyboard appears). No-op when the backend does not support this.
export function setSoftKeyboardScrollAssistEnabled(enabled: boolean): void {
  getSoftKeyboardBackend().setScrollAssistEnabled?.(enabled);
}

// Sets the visual style / appearance of the on-screen keyboard (iOS light/dark keyboard appearance).
// No-op on web and on backends that do not support style control.
export function setSoftKeyboardStyle(style: SoftKeyboardStyleKind): void {
  getSoftKeyboardBackend().setStyle?.(style);
}

// Requests that the host present the on-screen keyboard. A no-op on web unless the
// navigator.virtualKeyboard API is available (Chromium with virtualKeyboard policy).
export function showSoftKeyboard(): void {
  getSoftKeyboardBackend().show();
}

let _custom: SoftKeyboardBackend | null = null;
let _host: SoftKeyboardBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
const _sentinel: SoftKeyboardBackend = {
  getInfo(out) {
    out.visible = false;
    out.height = 0;
    out.x = 0;
    out.y = 0;
    out.width = 0;
    return out;
  },
  subscribe() {
    return () => {};
  },
  show() {},
  hide() {},
};
const _scratch: SoftKeyboardInfo = createSoftKeyboardInfo();
const _subscriptions = new WeakMap<SoftKeyboard, () => void>();

// Represents the Chromium VirtualKeyboard API (navigator.virtualKeyboard). Defined inline to avoid
// a lib.dom dependency gap; guarded at runtime.
interface VirtualKeyboard extends EventTarget {
  readonly boundingRect: DOMRect;
  overlaysContent: boolean;
  show(): void;
  hide(): void;
}

function getVirtualKeyboard(): VirtualKeyboard | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { virtualKeyboard?: VirtualKeyboard };
  return nav.virtualKeyboard ?? null;
}

interface WebKeyboardGeometry {
  height: number;
  width: number;
  x: number;
  y: number;
}

function getWebKeyboardGeometry(): WebKeyboardGeometry {
  if (typeof window === 'undefined') return { height: 0, width: 0, x: 0, y: 0 };
  // Prefer the Chromium VirtualKeyboard API for precise geometry.
  const vk = getVirtualKeyboard();
  if (vk !== null) {
    const rect = vk.boundingRect;
    return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
  }
  // Fall back to inferring height from visualViewport shrink.
  const viewport = window.visualViewport;
  if (viewport === undefined || viewport === null) return { height: 0, width: 0, x: 0, y: 0 };
  const shrink = window.innerHeight - viewport.height;
  const height = shrink > 0 ? shrink : 0;
  const width = height > 0 ? window.innerWidth : 0;
  const y = height > 0 ? viewport.height : 0;
  return { height, width, x: 0, y };
}
