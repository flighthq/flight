import { createEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  HasSoftKeyboardAccessoryBar,
  HasSoftKeyboardChange,
  HasSoftKeyboardInfo,
  HasSoftKeyboardResizeModeWrite,
  HasSoftKeyboardScrollAssist,
  HasSoftKeyboardStyle,
  HasSoftKeyboardVisibility,
  SoftKeyboard,
  SoftKeyboardAttachResult,
  SoftKeyboardInfo,
  SoftKeyboardResizeMode,
  SoftKeyboardSetterResult,
  SoftKeyboardStyleKind,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';

export async function attachSoftKeyboard(
  host: HasSoftKeyboardChange & HasSoftKeyboardInfo,
  keyboard: SoftKeyboard,
): Promise<SoftKeyboardAttachResult> {
  detachSoftKeyboard(keyboard);
  const change = host.input.softKeyboardChange;
  const info = host.input.softKeyboardInfo;
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

export function getSoftKeyboardHeight(host: HasSoftKeyboardInfo): number {
  return host.input.softKeyboardInfo.getInfo(_scratch).height;
}

export function getSoftKeyboardInfo(host: HasSoftKeyboardInfo, out: SoftKeyboardInfo): SoftKeyboardInfo {
  return host.input.softKeyboardInfo.getInfo(out);
}

export function hideSoftKeyboard(host: HasSoftKeyboardVisibility): Promise<SoftKeyboardVisibilityResult> {
  return host.input.softKeyboardVisibility.hide();
}

export function isSoftKeyboardVisible(host: HasSoftKeyboardInfo): boolean {
  return host.input.softKeyboardInfo.getInfo(_scratch).visible;
}

export function setSoftKeyboardAccessoryBarVisible(
  host: HasSoftKeyboardAccessoryBar,
  visible: boolean,
): Promise<SoftKeyboardSetterResult> {
  return host.input.softKeyboardAccessoryBar.setAccessoryBarVisible(visible);
}

export function setSoftKeyboardResizeMode(
  host: HasSoftKeyboardResizeModeWrite,
  mode: SoftKeyboardResizeMode,
): Promise<SoftKeyboardSetterResult> {
  return host.input.softKeyboardResizeModeWrite.setResizeMode(mode);
}

export function setSoftKeyboardScrollAssistEnabled(
  host: HasSoftKeyboardScrollAssist,
  enabled: boolean,
): Promise<SoftKeyboardSetterResult> {
  return host.input.softKeyboardScrollAssist.setScrollAssistEnabled(enabled);
}

export function setSoftKeyboardStyle(
  host: HasSoftKeyboardStyle,
  style: SoftKeyboardStyleKind,
): Promise<SoftKeyboardSetterResult> {
  return host.input.softKeyboardStyle.setStyle(style);
}

export function showSoftKeyboard(host: HasSoftKeyboardVisibility): Promise<SoftKeyboardVisibilityResult> {
  return host.input.softKeyboardVisibility.show();
}

const _scratch: SoftKeyboardInfo = { visible: false, height: 0, x: 0, y: 0, width: 0 };
const _subscriptions = new WeakMap<SoftKeyboard, () => void>();
