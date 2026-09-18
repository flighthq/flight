import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  Entity,
  HostSoftKeyboardAccessoryBarCapability,
  HostSoftKeyboardChangeCapability,
  SoftKeyboardChangeSubscription,
  SoftKeyboardInfo,
  HostSoftKeyboardInfoCapability,
  SoftKeyboardResizeMode,
  HostSoftKeyboardResizeModeWriteCapability,
  HostSoftKeyboardScrollAssistCapability,
  SoftKeyboardSetterResult,
  HostSoftKeyboardStyleCapability,
  SoftKeyboardStyleKind,
  HostSoftKeyboardVisibilityCapability,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';
import {
  SoftKeyboardResizeBodyKind,
  SoftKeyboardResizeNoneKind,
  SoftKeyboardStyleDarkKind,
} from '@flighthq/types/contract';

export function capacitorHostSoftKeyboardAccessoryBar(
  capacitor: CapacitorApi,
): HostSoftKeyboardAccessoryBarCapability & Entity {
  const out = allocateEntity<HostSoftKeyboardAccessoryBarCapability & Entity>();
  populateCapacitorSoftKeyboardAccessoryBar(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardChange(capacitor: CapacitorApi): HostSoftKeyboardChangeCapability & Entity {
  const out = allocateEntity<HostSoftKeyboardChangeCapability & Entity>();
  populateCapacitorSoftKeyboardChange(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardInfo(capacitor: CapacitorApi): HostSoftKeyboardInfoCapability & Entity {
  const out = allocateEntity<HostSoftKeyboardInfoCapability & Entity>();
  populateCapacitorSoftKeyboardInfo(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardResizeModeWrite(
  capacitor: CapacitorApi,
): HostSoftKeyboardResizeModeWriteCapability & Entity {
  const out = allocateEntity<HostSoftKeyboardResizeModeWriteCapability & Entity>();
  populateCapacitorSoftKeyboardResizeModeWrite(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardScrollAssist(
  capacitor: CapacitorApi,
): HostSoftKeyboardScrollAssistCapability & Entity {
  const out = allocateEntity<HostSoftKeyboardScrollAssistCapability & Entity>();
  populateCapacitorSoftKeyboardScrollAssist(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardStyle(capacitor: CapacitorApi): HostSoftKeyboardStyleCapability & Entity {
  const out = allocateEntity<HostSoftKeyboardStyleCapability & Entity>();
  populateCapacitorSoftKeyboardStyle(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardVisibility(
  capacitor: CapacitorApi,
): HostSoftKeyboardVisibilityCapability & Entity {
  const out = allocateEntity<HostSoftKeyboardVisibilityCapability & Entity>();
  populateCapacitorSoftKeyboardVisibility(out, capacitor.keyboard);
  return finishEntity(out);
}

function populateCapacitorSoftKeyboardAccessoryBar(
  out: HostSoftKeyboardAccessoryBarCapability,
  keyboard: CapacitorApi['keyboard'],
): void {
  out.setAccessoryBarVisible = async (visible: boolean): Promise<SoftKeyboardSetterResult> => {
    try {
      await keyboard.setAccessoryBarVisible({ isVisible: visible });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
}

function populateCapacitorSoftKeyboardChange(
  out: HostSoftKeyboardChangeCapability,
  keyboard: CapacitorApi['keyboard'],
): void {
  out.subscribe = async (listener: () => void): Promise<SoftKeyboardChangeSubscription> => {
    let showHandle: CapacitorPluginListenerHandle;
    let hideHandle: CapacitorPluginListenerHandle;
    try {
      showHandle = await keyboard.addListener('keyboardWillShow', () => listener());
      hideHandle = await keyboard.addListener('keyboardWillHide', () => listener());
    } catch {
      return { result: 'acquisition-failed', unsubscribe: null };
    }
    return {
      result: 'ok',
      unsubscribe: () => {
        showHandle.remove().catch(() => {});
        hideHandle.remove().catch(() => {});
      },
    };
  };
}

function populateCapacitorSoftKeyboardInfo(
  out: HostSoftKeyboardInfoCapability,
  keyboard: CapacitorApi['keyboard'],
): void {
  let mirrorVisible = false;
  let mirrorHeight = 0;
  keyboard
    .addListener('keyboardWillShow', (info) => {
      mirrorVisible = true;
      mirrorHeight = info.keyboardHeight;
    })
    .catch(() => {});
  keyboard
    .addListener('keyboardWillHide', () => {
      mirrorVisible = false;
      mirrorHeight = 0;
    })
    .catch(() => {});
  out.getInfo = (target: SoftKeyboardInfo): SoftKeyboardInfo => {
    target.visible = mirrorVisible;
    target.height = mirrorHeight;
    target.x = 0;
    target.y = 0;
    target.width = 0;
    return target;
  };
}

function populateCapacitorSoftKeyboardResizeModeWrite(
  out: HostSoftKeyboardResizeModeWriteCapability,
  keyboard: CapacitorApi['keyboard'],
): void {
  out.setResizeMode = async (mode: SoftKeyboardResizeMode): Promise<SoftKeyboardSetterResult> => {
    try {
      await keyboard.setResizeMode({ mode: toCapacitorResizeMode(mode) });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
}

function populateCapacitorSoftKeyboardScrollAssist(
  out: HostSoftKeyboardScrollAssistCapability,
  keyboard: CapacitorApi['keyboard'],
): void {
  out.setScrollAssistEnabled = async (enabled: boolean): Promise<SoftKeyboardSetterResult> => {
    try {
      await keyboard.setScroll({ isDisabled: !enabled });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
}

function populateCapacitorSoftKeyboardStyle(
  out: HostSoftKeyboardStyleCapability,
  keyboard: CapacitorApi['keyboard'],
): void {
  out.setStyle = async (style: SoftKeyboardStyleKind): Promise<SoftKeyboardSetterResult> => {
    try {
      await keyboard.setStyle({ style: style === SoftKeyboardStyleDarkKind ? 'DARK' : 'DEFAULT' });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
}

function populateCapacitorSoftKeyboardVisibility(
  out: HostSoftKeyboardVisibilityCapability,
  keyboard: CapacitorApi['keyboard'],
): void {
  out.hide = async (): Promise<SoftKeyboardVisibilityResult> => {
    try {
      await keyboard.hide();
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
  out.show = async (): Promise<SoftKeyboardVisibilityResult> => {
    try {
      await keyboard.show();
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
}

function toCapacitorResizeMode(mode: SoftKeyboardResizeMode): string {
  if (mode === SoftKeyboardResizeNoneKind) return 'none';
  if (mode === SoftKeyboardResizeBodyKind) return 'body';
  return mode;
}
