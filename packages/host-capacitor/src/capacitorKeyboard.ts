import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  Entity,
  EntityConstruction,
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
  initializeCapacitorSoftKeyboardAccessoryBarBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardChangeBackend(capacitor: CapacitorApi): SoftKeyboardChangeBackend & Entity {
  const out = allocateEntity<SoftKeyboardChangeBackend>();
  initializeCapacitorSoftKeyboardChangeBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardInfoBackend(capacitor: CapacitorApi): SoftKeyboardInfoBackend & Entity {
  const out = allocateEntity<SoftKeyboardInfoBackend>();
  initializeCapacitorSoftKeyboardInfoBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardResizeModeWriteBackend(
  capacitor: CapacitorApi,
): SoftKeyboardResizeModeWriteBackend & Entity {
  const out = allocateEntity<SoftKeyboardResizeModeWriteBackend>();
  initializeCapacitorSoftKeyboardResizeModeWriteBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardScrollAssistBackend(
  capacitor: CapacitorApi,
): SoftKeyboardScrollAssistBackend & Entity {
  const out = allocateEntity<SoftKeyboardScrollAssistBackend>();
  initializeCapacitorSoftKeyboardScrollAssistBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardStyleBackend(capacitor: CapacitorApi): SoftKeyboardStyleBackend & Entity {
  const out = allocateEntity<SoftKeyboardStyleBackend>();
  initializeCapacitorSoftKeyboardStyleBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardVisibilityBackend(
  capacitor: CapacitorApi,
): SoftKeyboardVisibilityBackend & Entity {
  const out = allocateEntity<SoftKeyboardVisibilityBackend>();
  initializeCapacitorSoftKeyboardVisibilityBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function initializeCapacitorSoftKeyboardAccessoryBarBackend(
  out: EntityConstruction<SoftKeyboardAccessoryBarBackend>,
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

export function initializeCapacitorSoftKeyboardChangeBackend(
  out: EntityConstruction<SoftKeyboardChangeBackend>,
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

export function initializeCapacitorSoftKeyboardInfoBackend(
  out: EntityConstruction<SoftKeyboardInfoBackend>,
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

export function initializeCapacitorSoftKeyboardResizeModeWriteBackend(
  out: EntityConstruction<SoftKeyboardResizeModeWriteBackend>,
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

export function initializeCapacitorSoftKeyboardScrollAssistBackend(
  out: EntityConstruction<SoftKeyboardScrollAssistBackend>,
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

export function initializeCapacitorSoftKeyboardStyleBackend(
  out: EntityConstruction<SoftKeyboardStyleBackend>,
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

export function initializeCapacitorSoftKeyboardVisibilityBackend(
  out: EntityConstruction<SoftKeyboardVisibilityBackend>,
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
