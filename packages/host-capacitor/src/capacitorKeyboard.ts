import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  Entity,
  SoftKeyboardAccessoryBarBackend,
  SoftKeyboardChangeBackend,
  SoftKeyboardChangeSubscription,
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
import {
  SoftKeyboardResizeBodyKind,
  SoftKeyboardResizeNoneKind,
  SoftKeyboardStyleDarkKind,
} from '@flighthq/types/contract';

export function createCapacitorSoftKeyboardAccessoryBarBackend(
  capacitor: CapacitorApi,
): SoftKeyboardAccessoryBarBackend & Entity {
  const out = allocateEntity<SoftKeyboardAccessoryBarBackend>();
  out.setAccessoryBarVisible = async (visible: boolean): Promise<SoftKeyboardSetterResult> => {
    try {
      await capacitor.keyboard.setAccessoryBarVisible({ isVisible: visible });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardChangeBackend(capacitor: CapacitorApi): SoftKeyboardChangeBackend & Entity {
  const keyboard = capacitor.keyboard;
  const out = allocateEntity<SoftKeyboardChangeBackend>();
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
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardInfoBackend(capacitor: CapacitorApi): SoftKeyboardInfoBackend & Entity {
  const keyboard = capacitor.keyboard;
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
  const out = allocateEntity<SoftKeyboardInfoBackend>();
  out.getInfo = (target: SoftKeyboardInfo): SoftKeyboardInfo => {
    target.visible = mirrorVisible;
    target.height = mirrorHeight;
    target.x = 0;
    target.y = 0;
    target.width = 0;
    return target;
  };
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardResizeModeWriteBackend(
  capacitor: CapacitorApi,
): SoftKeyboardResizeModeWriteBackend & Entity {
  const out = allocateEntity<SoftKeyboardResizeModeWriteBackend>();
  out.setResizeMode = async (mode: SoftKeyboardResizeMode): Promise<SoftKeyboardSetterResult> => {
    try {
      await capacitor.keyboard.setResizeMode({ mode: toCapacitorResizeMode(mode) });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardScrollAssistBackend(
  capacitor: CapacitorApi,
): SoftKeyboardScrollAssistBackend & Entity {
  const out = allocateEntity<SoftKeyboardScrollAssistBackend>();
  out.setScrollAssistEnabled = async (enabled: boolean): Promise<SoftKeyboardSetterResult> => {
    try {
      await capacitor.keyboard.setScroll({ isDisabled: !enabled });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardStyleBackend(capacitor: CapacitorApi): SoftKeyboardStyleBackend & Entity {
  const out = allocateEntity<SoftKeyboardStyleBackend>();
  out.setStyle = async (style: SoftKeyboardStyleKind): Promise<SoftKeyboardSetterResult> => {
    try {
      await capacitor.keyboard.setStyle({ style: style === SoftKeyboardStyleDarkKind ? 'DARK' : 'DEFAULT' });
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardVisibilityBackend(
  capacitor: CapacitorApi,
): SoftKeyboardVisibilityBackend & Entity {
  const out = allocateEntity<SoftKeyboardVisibilityBackend>();
  out.show = async (): Promise<SoftKeyboardVisibilityResult> => {
    try {
      await capacitor.keyboard.show();
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
  out.hide = async (): Promise<SoftKeyboardVisibilityResult> => {
    try {
      await capacitor.keyboard.hide();
      return 'ok';
    } catch {
      return 'operation-failed';
    }
  };
  return finishEntity(out);
}

function toCapacitorResizeMode(mode: SoftKeyboardResizeMode): string {
  if (mode === SoftKeyboardResizeNoneKind) return 'none';
  if (mode === SoftKeyboardResizeBodyKind) return 'body';
  return mode;
}
