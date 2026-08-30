import { createEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  Entity,
  SoftKeyboardAccessoryBarBackend,
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
  EntityRuntimeKey,
} from '@flighthq/types/contract';
import {
  SoftKeyboardResizeBodyKind,
  SoftKeyboardResizeNoneKind,
  SoftKeyboardStyleDarkKind,
} from '@flighthq/types/contract';

type OmitRuntime<T> = Omit<T, typeof EntityRuntimeKey>;

export function createCapacitorSoftKeyboardAccessoryBarBackend(
  capacitor: CapacitorApi,
): SoftKeyboardAccessoryBarBackend & Entity {
  return createEntity({
    async setAccessoryBarVisible(visible: boolean): Promise<SoftKeyboardSetterResult> {
      try {
        await capacitor.keyboard.setAccessoryBarVisible({ isVisible: visible });
        return 'ok';
      } catch {
        return 'operation-failed';
      }
    },
  } satisfies OmitRuntime<SoftKeyboardAccessoryBarBackend>);
}

export function createCapacitorSoftKeyboardChangeBackend(capacitor: CapacitorApi): SoftKeyboardChangeBackend & Entity {
  const keyboard = capacitor.keyboard;
  return createEntity({
    async subscribe(listener: () => void): Promise<(() => void) | null> {
      let showHandle: CapacitorPluginListenerHandle;
      let hideHandle: CapacitorPluginListenerHandle;
      try {
        showHandle = await keyboard.addListener('keyboardWillShow', () => listener());
        hideHandle = await keyboard.addListener('keyboardWillHide', () => listener());
      } catch {
        return null;
      }
      return () => {
        showHandle.remove().catch(() => {});
        hideHandle.remove().catch(() => {});
      };
    },
  } satisfies OmitRuntime<SoftKeyboardChangeBackend>);
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
  return createEntity({
    getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
      out.visible = mirrorVisible;
      out.height = mirrorHeight;
      out.x = 0;
      out.y = 0;
      out.width = 0;
      return out;
    },
  } satisfies OmitRuntime<SoftKeyboardInfoBackend>);
}

export function createCapacitorSoftKeyboardResizeModeWriteBackend(
  capacitor: CapacitorApi,
): SoftKeyboardResizeModeWriteBackend & Entity {
  return createEntity({
    async setResizeMode(mode: SoftKeyboardResizeMode): Promise<SoftKeyboardSetterResult> {
      try {
        await capacitor.keyboard.setResizeMode({ mode: toCapacitorResizeMode(mode) });
        return 'ok';
      } catch {
        return 'operation-failed';
      }
    },
  } satisfies OmitRuntime<SoftKeyboardResizeModeWriteBackend>);
}

export function createCapacitorSoftKeyboardScrollAssistBackend(
  capacitor: CapacitorApi,
): SoftKeyboardScrollAssistBackend & Entity {
  return createEntity({
    async setScrollAssistEnabled(enabled: boolean): Promise<SoftKeyboardSetterResult> {
      try {
        await capacitor.keyboard.setScroll({ isDisabled: !enabled });
        return 'ok';
      } catch {
        return 'operation-failed';
      }
    },
  } satisfies OmitRuntime<SoftKeyboardScrollAssistBackend>);
}

export function createCapacitorSoftKeyboardStyleBackend(capacitor: CapacitorApi): SoftKeyboardStyleBackend & Entity {
  return createEntity({
    async setStyle(style: SoftKeyboardStyleKind): Promise<SoftKeyboardSetterResult> {
      try {
        await capacitor.keyboard.setStyle({ style: style === SoftKeyboardStyleDarkKind ? 'DARK' : 'DEFAULT' });
        return 'ok';
      } catch {
        return 'operation-failed';
      }
    },
  } satisfies OmitRuntime<SoftKeyboardStyleBackend>);
}

export function createCapacitorSoftKeyboardVisibilityBackend(
  capacitor: CapacitorApi,
): SoftKeyboardVisibilityBackend & Entity {
  return createEntity({
    async show(): Promise<SoftKeyboardVisibilityResult> {
      try {
        await capacitor.keyboard.show();
        return 'ok';
      } catch {
        return 'operation-failed';
      }
    },
    async hide(): Promise<SoftKeyboardVisibilityResult> {
      try {
        await capacitor.keyboard.hide();
        return 'ok';
      } catch {
        return 'operation-failed';
      }
    },
  } satisfies OmitRuntime<SoftKeyboardVisibilityBackend>);
}

function toCapacitorResizeMode(mode: SoftKeyboardResizeMode): string {
  if (mode === SoftKeyboardResizeNoneKind) return 'none';
  if (mode === SoftKeyboardResizeBodyKind) return 'body';
  return mode;
}
