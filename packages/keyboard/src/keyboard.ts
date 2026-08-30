import { createEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  SoftKeyboard,
  SoftKeyboardBackend,
  SoftKeyboardInfo,
  SoftKeyboardResizeMode,
  SoftKeyboardStyleKind,
} from '@flighthq/types/contract';

// Begins delivering on-screen keyboard geometry changes to `keyboard`'s signals by subscribing to
// the active backend. On each raw geometry notification the core reads getInfo, compares height and
// visibility against the prior snapshot, and emits only the truthful derived edge: onShow when
// height transitions from 0 to positive, onHide when positive to 0, onResize when positive changes.
// Idempotent: a prior subscription is torn down first. Returns null when acquisition fails
// (sentinel, no window, or native listener attachment rejection). Pair with
// detachSoftKeyboard/disposeSoftKeyboard.
export async function attachSoftKeyboard(keyboard: SoftKeyboard): Promise<boolean> {
  detachSoftKeyboard(keyboard);
  const backend = getSoftKeyboardBackend();
  let prevHeight = backend.getInfo(_scratch).height;
  const unsubscribe = await backend.subscribe(() => {
    const info = backend.getInfo(_scratch);
    const nowHeight = info.height;
    const wasVisible = prevHeight > 0;
    const nowVisible = nowHeight > 0;
    if (nowVisible && !wasVisible) {
      prevHeight = nowHeight;
      emitSignal(keyboard.onShow, nowHeight);
    } else if (!nowVisible && wasVisible) {
      prevHeight = 0;
      emitSignal(keyboard.onHide);
    } else if (nowVisible && nowHeight !== prevHeight) {
      prevHeight = nowHeight;
      emitSignal(keyboard.onResize, nowHeight);
    }
  });
  if (unsubscribe === null) return false;
  _subscriptions.set(keyboard, unsubscribe);
  return true;
}

export function createSoftKeyboard(): SoftKeyboard & Entity {
  return createEntity({
    onShow: createSignal(),
    onHide: createSignal(),
    onResize: createSignal(),
  } satisfies SoftKeyboard);
}

// Stops delivery to `keyboard` and forgets its subscription. Safe to call when not attached.
export function detachSoftKeyboard(keyboard: SoftKeyboard): void {
  const unsubscribe = _subscriptions.get(keyboard);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(keyboard);
  }
}

// Releases `keyboard` for garbage collection by detaching its backend subscription.
export function disposeSoftKeyboard(keyboard: SoftKeyboard): void {
  detachSoftKeyboard(keyboard);
}

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

export function hasSoftKeyboardBackend(): boolean {
  return _custom !== null || _host !== null;
}

// `ok` means the provider accepted/completed the API call, not that OS policy visibly changed.
export async function hideSoftKeyboard(): Promise<boolean> {
  return getSoftKeyboardBackend().hide();
}

export function installSoftKeyboardHostBackend(backend: SoftKeyboardBackend): void {
  if (_host !== null) return;
  _host = backend;
}

export function isSoftKeyboardVisible(): boolean {
  return getSoftKeyboardBackend().getInfo(_scratch).visible;
}

export function resetSoftKeyboardBackendForTest(): void {
  _custom = null;
  _host = null;
}

// `ok` means the provider accepted/completed the API call, not that OS policy visibly changed.
export async function setSoftKeyboardAccessoryBarVisible(visible: boolean): Promise<boolean> {
  const backend = getSoftKeyboardBackend();
  if (backend.setAccessoryBarVisible === undefined) return false;
  return backend.setAccessoryBarVisible(visible);
}

export function setSoftKeyboardBackend(backend: SoftKeyboardBackend | null): void {
  _custom = backend;
}

// `ok` means the provider accepted/completed the API call, not that OS policy visibly changed.
export async function setSoftKeyboardResizeMode(mode: SoftKeyboardResizeMode): Promise<boolean> {
  const backend = getSoftKeyboardBackend();
  if (backend.setResizeMode === undefined) return false;
  return backend.setResizeMode(mode);
}

// `ok` means the provider accepted/completed the API call, not that OS policy visibly changed.
export async function setSoftKeyboardScrollAssistEnabled(enabled: boolean): Promise<boolean> {
  const backend = getSoftKeyboardBackend();
  if (backend.setScrollAssistEnabled === undefined) return false;
  return backend.setScrollAssistEnabled(enabled);
}

// `ok` means the provider accepted/completed the API call, not that OS policy visibly changed.
export async function setSoftKeyboardStyle(style: SoftKeyboardStyleKind): Promise<boolean> {
  const backend = getSoftKeyboardBackend();
  if (backend.setStyle === undefined) return false;
  return backend.setStyle(style);
}

// `ok` means the provider accepted/completed the API call, not that OS policy visibly changed.
export async function showSoftKeyboard(): Promise<boolean> {
  return getSoftKeyboardBackend().show();
}

let _custom: SoftKeyboardBackend | null = null;
let _host: SoftKeyboardBackend | null = null;
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
    return Promise.resolve(null);
  },
  show() {
    return Promise.resolve(false);
  },
  hide() {
    return Promise.resolve(false);
  },
};
const _scratch: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0 };
const _subscriptions = new WeakMap<SoftKeyboard, () => void>();
