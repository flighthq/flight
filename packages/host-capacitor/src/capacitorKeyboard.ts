import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  Entity,
  EntityConstruction,
  HostSoftKeyboardAccessoryBarProvider,
  HostSoftKeyboardChangeProvider,
  SoftKeyboardChangeSubscription,
  SoftKeyboardInfo,
  HostSoftKeyboardInfoProvider,
  SoftKeyboardResizeMode,
  HostSoftKeyboardResizeModeWriteProvider,
  HostSoftKeyboardScrollAssistProvider,
  SoftKeyboardSetterResult,
  HostSoftKeyboardStyleProvider,
  SoftKeyboardStyleKind,
  HostSoftKeyboardVisibilityProvider,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';
import {
  SoftKeyboardResizeBodyKind,
  SoftKeyboardResizeNoneKind,
  SoftKeyboardStyleDarkKind,
} from '@flighthq/types/contract';

export function createCapacitorSoftKeyboardAccessoryBarBackend(
  capacitor: CapacitorApi,
): HostSoftKeyboardAccessoryBarProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardAccessoryBarProvider>();
  initializeCapacitorSoftKeyboardAccessoryBarBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardChangeBackend(
  capacitor: CapacitorApi,
): HostSoftKeyboardChangeProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardChangeProvider>();
  initializeCapacitorSoftKeyboardChangeBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardInfoBackend(capacitor: CapacitorApi): HostSoftKeyboardInfoProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardInfoProvider>();
  initializeCapacitorSoftKeyboardInfoBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardResizeModeWriteBackend(
  capacitor: CapacitorApi,
): HostSoftKeyboardResizeModeWriteProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardResizeModeWriteProvider>();
  initializeCapacitorSoftKeyboardResizeModeWriteBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardScrollAssistBackend(
  capacitor: CapacitorApi,
): HostSoftKeyboardScrollAssistProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardScrollAssistProvider>();
  initializeCapacitorSoftKeyboardScrollAssistBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardStyleBackend(
  capacitor: CapacitorApi,
): HostSoftKeyboardStyleProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardStyleProvider>();
  initializeCapacitorSoftKeyboardStyleBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function createCapacitorSoftKeyboardVisibilityBackend(
  capacitor: CapacitorApi,
): HostSoftKeyboardVisibilityProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardVisibilityProvider>();
  initializeCapacitorSoftKeyboardVisibilityBackend(out, capacitor.keyboard);
  return finishEntity(out);
}

export function initializeCapacitorSoftKeyboardAccessoryBarBackend(
  out: EntityConstruction<HostSoftKeyboardAccessoryBarProvider>,
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
  out: EntityConstruction<HostSoftKeyboardChangeProvider>,
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
  out: EntityConstruction<HostSoftKeyboardInfoProvider>,
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
  out: EntityConstruction<HostSoftKeyboardResizeModeWriteProvider>,
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
  out: EntityConstruction<HostSoftKeyboardScrollAssistProvider>,
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
  out: EntityConstruction<HostSoftKeyboardStyleProvider>,
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
  out: EntityConstruction<HostSoftKeyboardVisibilityProvider>,
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
