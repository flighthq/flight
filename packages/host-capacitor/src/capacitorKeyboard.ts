import { createEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  Entity,
  SoftKeyboardBackend,
  SoftKeyboardInfo,
  SoftKeyboardResizeMode,
  SoftKeyboardStyleKind,
} from '@flighthq/types/contract';
import {
  SoftKeyboardResizeBodyKind,
  SoftKeyboardResizeNoneKind,
  SoftKeyboardStyleDarkKind,
} from '@flighthq/types/contract';

export function createCapacitorKeyboardBackend(capacitor: CapacitorApi): SoftKeyboardBackend & Entity {
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
    async show(): Promise<boolean> {
      try {
        await keyboard.show();
        return true;
      } catch {
        return false;
      }
    },
    async hide(): Promise<boolean> {
      try {
        await keyboard.hide();
        return true;
      } catch {
        return false;
      }
    },
    async setResizeMode(mode: SoftKeyboardResizeMode): Promise<boolean> {
      try {
        await keyboard.setResizeMode({ mode: toCapacitorResizeMode(mode) });
        return true;
      } catch {
        return false;
      }
    },
    async setAccessoryBarVisible(visible: boolean): Promise<boolean> {
      try {
        await keyboard.setAccessoryBarVisible({ isVisible: visible });
        return true;
      } catch {
        return false;
      }
    },
    async setScrollAssistEnabled(enabled: boolean): Promise<boolean> {
      try {
        await keyboard.setScroll({ isDisabled: !enabled });
        return true;
      } catch {
        return false;
      }
    },
    async setStyle(style: SoftKeyboardStyleKind): Promise<boolean> {
      try {
        await keyboard.setStyle({ style: style === SoftKeyboardStyleDarkKind ? 'DARK' : 'DEFAULT' });
        return true;
      } catch {
        return false;
      }
    },
  } satisfies SoftKeyboardBackend);
}

function toCapacitorResizeMode(mode: SoftKeyboardResizeMode): string {
  if (mode === SoftKeyboardResizeNoneKind) return 'none';
  if (mode === SoftKeyboardResizeBodyKind) return 'body';
  return mode;
}
