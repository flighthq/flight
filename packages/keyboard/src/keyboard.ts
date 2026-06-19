import { createSignal, emitSignal } from '@flighthq/signals';
import type { SoftKeyboard, SoftKeyboardBackend, SoftKeyboardInfo } from '@flighthq/types';

// Begins delivering on-screen keyboard changes to `keyboard`'s signals by subscribing to the active
// backend. On each change it reads fresh info and emits onResize plus onShow when visibility
// transitions true and onHide when it transitions false. Idempotent: a prior subscription is torn
// down first. Pair with detachSoftKeyboard/disposeSoftKeyboard.
export function attachSoftKeyboard(keyboard: SoftKeyboard): void {
  detachSoftKeyboard(keyboard);
  const backend = getSoftKeyboardBackend();
  let wasVisible = backend.getInfo(_scratch).visible;
  const unsubscribe = backend.subscribe(() => {
    const info = backend.getInfo(_scratch);
    emitSignal(keyboard.onResize, info.height);
    if (info.visible !== wasVisible) {
      wasVisible = info.visible;
      if (info.visible) {
        emitSignal(keyboard.onShow, info.height);
      } else {
        emitSignal(keyboard.onHide);
      }
    }
  });
  _subscriptions.set(keyboard, unsubscribe);
}

// Allocates a SoftKeyboard event entity with inert signals; call attachSoftKeyboard to start delivery.
export function createSoftKeyboard(): SoftKeyboard {
  return { onShow: createSignal(), onHide: createSignal(), onResize: createSignal() };
}

// Allocates a zeroed SoftKeyboardInfo, suitable as the `out` for getSoftKeyboardInfo.
export function createSoftKeyboardInfo(): SoftKeyboardInfo {
  return { visible: false, height: 0 };
}

// Builds the default web backend over window.visualViewport, inferring keyboard height from the
// viewport shrink relative to window.innerHeight. Degrades to height 0 and a no-op subscription where
// the API is absent. show/hide are no-ops: the web cannot programmatically toggle the soft keyboard.
export function createWebSoftKeyboardBackend(): SoftKeyboardBackend {
  return {
    getInfo(out) {
      const height = getWebKeyboardHeight();
      out.height = height;
      out.visible = height > 0;
      return out;
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => {};
      const viewport = window.visualViewport;
      if (viewport === undefined || viewport === null) return () => {};
      viewport.addEventListener('resize', listener);
      viewport.addEventListener('scroll', listener);
      return () => {
        viewport.removeEventListener('resize', listener);
        viewport.removeEventListener('scroll', listener);
      };
    },
    show() {
      // No-op: the web cannot programmatically open the soft keyboard.
    },
    hide() {
      // No-op: the web cannot programmatically dismiss the soft keyboard.
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

// The active soft keyboard backend, or a lazily-created web default. There is always a backend.
export function getSoftKeyboardBackend(): SoftKeyboardBackend {
  if (_backend === null) _backend = createWebSoftKeyboardBackend();
  return _backend;
}

// Fills `out` with the current on-screen keyboard snapshot and returns it.
export function getSoftKeyboardInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
  return getSoftKeyboardBackend().getInfo(out);
}

// Requests that the host dismiss the on-screen keyboard. A no-op on web.
export function hideSoftKeyboard(): void {
  getSoftKeyboardBackend().hide();
}

// Installs a native host soft keyboard backend; pass null to fall back to the web default.
export function setSoftKeyboardBackend(backend: SoftKeyboardBackend | null): void {
  _backend = backend;
}

// Requests that the host present the on-screen keyboard. A no-op on web.
export function showSoftKeyboard(): void {
  getSoftKeyboardBackend().show();
}

let _backend: SoftKeyboardBackend | null = null;
const _scratch: SoftKeyboardInfo = createSoftKeyboardInfo();
const _subscriptions = new WeakMap<SoftKeyboard, () => void>();

function getWebKeyboardHeight(): number {
  if (typeof window === 'undefined') return 0;
  const viewport = window.visualViewport;
  if (viewport === undefined || viewport === null) return 0;
  const shrink = window.innerHeight - viewport.height;
  return shrink > 0 ? shrink : 0;
}
