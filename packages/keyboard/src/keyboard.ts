import { createEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  SoftKeyboard,
  SoftKeyboardAccessoryBarBackend,
  SoftKeyboardAttachResult,
  SoftKeyboardChangeBackend,
  SoftKeyboardInfo,
  SoftKeyboardInfoBackend,
  SoftKeyboardResizeMode,
  SoftKeyboardResizeModeWriteBackend,
  SoftKeyboardScrollAssistBackend,
  SoftKeyboardSetterResult,
  SoftKeyboardStyleBackend,
  SoftKeyboardStyleKind,
  SoftKeyboardVisibilityBackend,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';

export async function attachSoftKeyboard(keyboard: SoftKeyboard): Promise<SoftKeyboardAttachResult> {
  detachSoftKeyboard(keyboard);
  const change = getSoftKeyboardChangeBackend();
  const info = getSoftKeyboardInfoBackend();
  if (change === null || info === null) return 'no-provider';
  let prevHeight = info.getInfo(_scratch).height;
  const unsubscribe = await change.subscribe(() => {
    const nowInfo = info.getInfo(_scratch);
    const nowHeight = nowInfo.height;
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
  if (unsubscribe === null) return 'acquisition-failed';
  _subscriptions.set(keyboard, unsubscribe);
  return 'ok';
}

export function createSoftKeyboard(): SoftKeyboard & Entity {
  return createEntity({
    onShow: createSignal(),
    onHide: createSignal(),
    onResize: createSignal(),
  } satisfies SoftKeyboard);
}

export function detachSoftKeyboard(keyboard: SoftKeyboard): void {
  const unsubscribe = _subscriptions.get(keyboard);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(keyboard);
  }
}

export function disposeSoftKeyboard(keyboard: SoftKeyboard): void {
  detachSoftKeyboard(keyboard);
}

export function getSoftKeyboardAccessoryBarBackend(): SoftKeyboardAccessoryBarBackend | null {
  return _customAccessoryBar ?? _hostAccessoryBar;
}

export function getSoftKeyboardChangeBackend(): SoftKeyboardChangeBackend | null {
  return _customChange ?? _hostChange;
}

export function getSoftKeyboardHeight(): number {
  const info = getSoftKeyboardInfoBackend();
  if (info === null) return 0;
  return info.getInfo(_scratch).height;
}

export function getSoftKeyboardInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
  const info = getSoftKeyboardInfoBackend();
  if (info === null) {
    out.visible = false;
    out.height = 0;
    out.x = 0;
    out.y = 0;
    out.width = 0;
    return out;
  }
  return info.getInfo(out);
}

export function getSoftKeyboardInfoBackend(): SoftKeyboardInfoBackend | null {
  return _customInfo ?? _hostInfo;
}

export function getSoftKeyboardResizeModeWriteBackend(): SoftKeyboardResizeModeWriteBackend | null {
  return _customResizeModeWrite ?? _hostResizeModeWrite;
}

export function getSoftKeyboardScrollAssistBackend(): SoftKeyboardScrollAssistBackend | null {
  return _customScrollAssist ?? _hostScrollAssist;
}

export function getSoftKeyboardStyleBackend(): SoftKeyboardStyleBackend | null {
  return _customStyle ?? _hostStyle;
}

export function getSoftKeyboardVisibilityBackend(): SoftKeyboardVisibilityBackend | null {
  return _customVisibility ?? _hostVisibility;
}

export async function hideSoftKeyboard(): Promise<SoftKeyboardVisibilityResult> {
  const backend = getSoftKeyboardVisibilityBackend();
  if (backend === null) return 'runtime-unavailable';
  return backend.hide();
}

export function installSoftKeyboardAccessoryBarHostBackend(backend: SoftKeyboardAccessoryBarBackend): void {
  if (_hostAccessoryBar !== null) return;
  _hostAccessoryBar = backend;
}

export function installSoftKeyboardChangeHostBackend(backend: SoftKeyboardChangeBackend): void {
  if (_hostChange !== null) return;
  _hostChange = backend;
}

export function installSoftKeyboardInfoHostBackend(backend: SoftKeyboardInfoBackend): void {
  if (_hostInfo !== null) return;
  _hostInfo = backend;
}

export function installSoftKeyboardResizeModeWriteHostBackend(backend: SoftKeyboardResizeModeWriteBackend): void {
  if (_hostResizeModeWrite !== null) return;
  _hostResizeModeWrite = backend;
}

export function installSoftKeyboardScrollAssistHostBackend(backend: SoftKeyboardScrollAssistBackend): void {
  if (_hostScrollAssist !== null) return;
  _hostScrollAssist = backend;
}

export function installSoftKeyboardStyleHostBackend(backend: SoftKeyboardStyleBackend): void {
  if (_hostStyle !== null) return;
  _hostStyle = backend;
}

export function installSoftKeyboardVisibilityHostBackend(backend: SoftKeyboardVisibilityBackend): void {
  if (_hostVisibility !== null) return;
  _hostVisibility = backend;
}

export function isSoftKeyboardVisible(): boolean {
  const info = getSoftKeyboardInfoBackend();
  if (info === null) return false;
  return info.getInfo(_scratch).visible;
}

export function resetSoftKeyboardBackendForTest(): void {
  _customAccessoryBar = null;
  _customChange = null;
  _customInfo = null;
  _customResizeModeWrite = null;
  _customScrollAssist = null;
  _customStyle = null;
  _customVisibility = null;
  _hostAccessoryBar = null;
  _hostChange = null;
  _hostInfo = null;
  _hostResizeModeWrite = null;
  _hostScrollAssist = null;
  _hostStyle = null;
  _hostVisibility = null;
}

export function setSoftKeyboardAccessoryBarBackend(backend: SoftKeyboardAccessoryBarBackend | null): void {
  _customAccessoryBar = backend;
}

export async function setSoftKeyboardAccessoryBarVisible(visible: boolean): Promise<SoftKeyboardSetterResult> {
  const backend = getSoftKeyboardAccessoryBarBackend();
  if (backend === null) return 'operation-unavailable';
  return backend.setAccessoryBarVisible(visible);
}

export function setSoftKeyboardChangeBackend(backend: SoftKeyboardChangeBackend | null): void {
  _customChange = backend;
}

export function setSoftKeyboardInfoBackend(backend: SoftKeyboardInfoBackend | null): void {
  _customInfo = backend;
}

export async function setSoftKeyboardResizeMode(mode: SoftKeyboardResizeMode): Promise<SoftKeyboardSetterResult> {
  const backend = getSoftKeyboardResizeModeWriteBackend();
  if (backend === null) return 'operation-unavailable';
  return backend.setResizeMode(mode);
}

export function setSoftKeyboardResizeModeWriteBackend(backend: SoftKeyboardResizeModeWriteBackend | null): void {
  _customResizeModeWrite = backend;
}

export function setSoftKeyboardScrollAssistBackend(backend: SoftKeyboardScrollAssistBackend | null): void {
  _customScrollAssist = backend;
}

export async function setSoftKeyboardScrollAssistEnabled(enabled: boolean): Promise<SoftKeyboardSetterResult> {
  const backend = getSoftKeyboardScrollAssistBackend();
  if (backend === null) return 'operation-unavailable';
  return backend.setScrollAssistEnabled(enabled);
}

export async function setSoftKeyboardStyle(style: SoftKeyboardStyleKind): Promise<SoftKeyboardSetterResult> {
  const backend = getSoftKeyboardStyleBackend();
  if (backend === null) return 'operation-unavailable';
  return backend.setStyle(style);
}

export function setSoftKeyboardStyleBackend(backend: SoftKeyboardStyleBackend | null): void {
  _customStyle = backend;
}

export function setSoftKeyboardVisibilityBackend(backend: SoftKeyboardVisibilityBackend | null): void {
  _customVisibility = backend;
}

export async function showSoftKeyboard(): Promise<SoftKeyboardVisibilityResult> {
  const backend = getSoftKeyboardVisibilityBackend();
  if (backend === null) return 'runtime-unavailable';
  return backend.show();
}

let _customAccessoryBar: SoftKeyboardAccessoryBarBackend | null = null;
let _customChange: SoftKeyboardChangeBackend | null = null;
let _customInfo: SoftKeyboardInfoBackend | null = null;
let _customResizeModeWrite: SoftKeyboardResizeModeWriteBackend | null = null;
let _customScrollAssist: SoftKeyboardScrollAssistBackend | null = null;
let _customStyle: SoftKeyboardStyleBackend | null = null;
let _customVisibility: SoftKeyboardVisibilityBackend | null = null;
let _hostAccessoryBar: SoftKeyboardAccessoryBarBackend | null = null;
let _hostChange: SoftKeyboardChangeBackend | null = null;
let _hostInfo: SoftKeyboardInfoBackend | null = null;
let _hostResizeModeWrite: SoftKeyboardResizeModeWriteBackend | null = null;
let _hostScrollAssist: SoftKeyboardScrollAssistBackend | null = null;
let _hostStyle: SoftKeyboardStyleBackend | null = null;
let _hostVisibility: SoftKeyboardVisibilityBackend | null = null;
const _scratch: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0 };
const _subscriptions = new WeakMap<SoftKeyboard, () => void>();
