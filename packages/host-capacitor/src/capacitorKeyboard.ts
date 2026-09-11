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

export function capacitorHostSoftKeyboardAccessoryBar(
  capacitor: CapacitorApi,
): HostSoftKeyboardAccessoryBarProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardAccessoryBarProvider>();
  populateCapacitorSoftKeyboardAccessoryBar(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardChange(capacitor: CapacitorApi): HostSoftKeyboardChangeProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardChangeProvider>();
  populateCapacitorSoftKeyboardChange(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardInfo(capacitor: CapacitorApi): HostSoftKeyboardInfoProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardInfoProvider>();
  populateCapacitorSoftKeyboardInfo(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardResizeModeWrite(
  capacitor: CapacitorApi,
): HostSoftKeyboardResizeModeWriteProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardResizeModeWriteProvider>();
  populateCapacitorSoftKeyboardResizeModeWrite(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardScrollAssist(
  capacitor: CapacitorApi,
): HostSoftKeyboardScrollAssistProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardScrollAssistProvider>();
  populateCapacitorSoftKeyboardScrollAssist(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardStyle(capacitor: CapacitorApi): HostSoftKeyboardStyleProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardStyleProvider>();
  populateCapacitorSoftKeyboardStyle(out, capacitor.keyboard);
  return finishEntity(out);
}

export function capacitorHostSoftKeyboardVisibility(
  capacitor: CapacitorApi,
): HostSoftKeyboardVisibilityProvider & Entity {
  const out = allocateEntity<HostSoftKeyboardVisibilityProvider>();
  populateCapacitorSoftKeyboardVisibility(out, capacitor.keyboard);
  return finishEntity(out);
}

function populateCapacitorSoftKeyboardAccessoryBar(
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

function populateCapacitorSoftKeyboardChange(
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

function populateCapacitorSoftKeyboardInfo(
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

function populateCapacitorSoftKeyboardResizeModeWrite(
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

function populateCapacitorSoftKeyboardScrollAssist(
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

function populateCapacitorSoftKeyboardStyle(
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

function populateCapacitorSoftKeyboardVisibility(
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
