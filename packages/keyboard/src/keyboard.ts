import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  EntityConstruction,
  HostSoftKeyboardAccessoryBarCapability,
  HostSoftKeyboardChangeCapability,
  HostSoftKeyboardInfoCapability,
  HostSoftKeyboardResizeModeWriteCapability,
  HostSoftKeyboardScrollAssistCapability,
  HostSoftKeyboardStyleCapability,
  HostSoftKeyboardVisibilityCapability,
  SoftKeyboard,
  SoftKeyboardAttachResult,
  SoftKeyboardInfo,
  SoftKeyboardResizeMode,
  SoftKeyboardSetterResult,
  SoftKeyboardStyleKind,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';

export async function attachSoftKeyboard(
  hostSoftKeyboardChange: Readonly<HostSoftKeyboardChangeCapability>,
  hostSoftKeyboardInfo: Readonly<HostSoftKeyboardInfoCapability>,
  keyboard: SoftKeyboard,
): Promise<SoftKeyboardAttachResult> {
  detachSoftKeyboard(keyboard);
  const change = hostSoftKeyboardChange;
  const info = hostSoftKeyboardInfo;
  let prevHeight = info.getInfo(_scratch).height;
  const subscription = await change.subscribe(() => {
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
  if (subscription.result !== 'ok') return subscription.result;
  _subscriptions.set(keyboard, subscription.unsubscribe!);
  return 'ok';
}

export function createSoftKeyboard(): SoftKeyboard & Entity {
  const out = allocateEntity<SoftKeyboard & Entity>();
  initializeSoftKeyboard(out);
  return finishEntity(out);
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

export function getSoftKeyboardHeight(hostSoftKeyboardInfo: Readonly<HostSoftKeyboardInfoCapability>): number {
  return hostSoftKeyboardInfo.getInfo(_scratch).height;
}

export function getSoftKeyboardInfo(
  hostSoftKeyboardInfo: Readonly<HostSoftKeyboardInfoCapability>,
  out: SoftKeyboardInfo,
): SoftKeyboardInfo {
  return hostSoftKeyboardInfo.getInfo(out);
}

export function hideSoftKeyboard(
  hostSoftKeyboardVisibility: Readonly<HostSoftKeyboardVisibilityCapability>,
): Promise<SoftKeyboardVisibilityResult> {
  return hostSoftKeyboardVisibility.hide();
}

export function initializeSoftKeyboard(out: EntityConstruction<SoftKeyboard & Entity>): void {
  out.onHide = createSignal();
  out.onResize = createSignal();
  out.onShow = createSignal();
}

export function isSoftKeyboardVisible(hostSoftKeyboardInfo: Readonly<HostSoftKeyboardInfoCapability>): boolean {
  return hostSoftKeyboardInfo.getInfo(_scratch).visible;
}

export function setSoftKeyboardAccessoryBarVisible(
  hostSoftKeyboardAccessoryBar: Readonly<HostSoftKeyboardAccessoryBarCapability>,
  visible: boolean,
): Promise<SoftKeyboardSetterResult> {
  return hostSoftKeyboardAccessoryBar.setAccessoryBarVisible(visible);
}

export function setSoftKeyboardResizeMode(
  hostSoftKeyboardResizeModeWrite: Readonly<HostSoftKeyboardResizeModeWriteCapability>,
  mode: SoftKeyboardResizeMode,
): Promise<SoftKeyboardSetterResult> {
  return hostSoftKeyboardResizeModeWrite.setResizeMode(mode);
}

export function setSoftKeyboardScrollAssistEnabled(
  hostSoftKeyboardScrollAssist: Readonly<HostSoftKeyboardScrollAssistCapability>,
  enabled: boolean,
): Promise<SoftKeyboardSetterResult> {
  return hostSoftKeyboardScrollAssist.setScrollAssistEnabled(enabled);
}

export function setSoftKeyboardStyle(
  hostSoftKeyboardStyle: Readonly<HostSoftKeyboardStyleCapability>,
  style: SoftKeyboardStyleKind,
): Promise<SoftKeyboardSetterResult> {
  return hostSoftKeyboardStyle.setStyle(style);
}

export function showSoftKeyboard(
  hostSoftKeyboardVisibility: Readonly<HostSoftKeyboardVisibilityCapability>,
): Promise<SoftKeyboardVisibilityResult> {
  return hostSoftKeyboardVisibility.show();
}

const _scratch: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0 };
const _subscriptions = new WeakMap<SoftKeyboard, () => void>();
