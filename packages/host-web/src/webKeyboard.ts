import { createEntity } from '@flighthq/entity/contract';
import { installSoftKeyboardHostBackend } from '@flighthq/keyboard/contract';
import type { Entity, SoftKeyboardBackend, SoftKeyboardInfo } from '@flighthq/types/contract';

export function createWebSoftKeyboardBackend(): SoftKeyboardBackend & Entity {
  return createEntity({
    getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
      const geo = getWebKeyboardGeometry();
      out.height = geo.height;
      out.visible = geo.height > 0;
      out.x = geo.x;
      out.y = geo.y;
      out.width = geo.width;
      return out;
    },
    async subscribe(listener: () => void): Promise<(() => void) | null> {
      if (typeof window === 'undefined') return null;
      const virtualKeyboard = getVirtualKeyboard();
      if (virtualKeyboard !== null) {
        virtualKeyboard.addEventListener('geometrychange', listener);
        return () => virtualKeyboard.removeEventListener('geometrychange', listener);
      }
      const viewport = window.visualViewport;
      if (viewport === undefined || viewport === null) return null;
      viewport.addEventListener('resize', listener);
      viewport.addEventListener('scroll', listener);
      return () => {
        viewport.removeEventListener('resize', listener);
        viewport.removeEventListener('scroll', listener);
      };
    },
    async show(): Promise<boolean> {
      const vk = getVirtualKeyboard();
      if (vk === null) return false;
      vk.show();
      return true;
    },
    async hide(): Promise<boolean> {
      const vk = getVirtualKeyboard();
      if (vk === null) return false;
      vk.hide();
      return true;
    },
  } satisfies SoftKeyboardBackend);
}

export function enableHostWebSoftKeyboard(): void {
  if (_enabled) return;
  _enabled = true;
  installSoftKeyboardHostBackend(createWebSoftKeyboardBackend());
}

export function resetHostWebKeyboardForTest(): void {
  _enabled = false;
}

interface VirtualKeyboard extends EventTarget {
  readonly boundingRect: DOMRect;
  overlaysContent: boolean;
  show(): void;
  hide(): void;
}

function getVirtualKeyboard(): VirtualKeyboard | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { virtualKeyboard?: VirtualKeyboard };
  return nav.virtualKeyboard ?? null;
}

interface WebKeyboardGeometry {
  height: number;
  width: number;
  x: number;
  y: number;
}

function getWebKeyboardGeometry(): WebKeyboardGeometry {
  if (typeof window === 'undefined') return { height: 0, width: 0, x: 0, y: 0 };
  const vk = getVirtualKeyboard();
  if (vk !== null) {
    const rect = vk.boundingRect;
    return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
  }
  const viewport = window.visualViewport;
  if (viewport === undefined || viewport === null) return { height: 0, width: 0, x: 0, y: 0 };
  const shrink = window.innerHeight - viewport.height;
  const height = shrink > 0 ? shrink : 0;
  const width = height > 0 ? window.innerWidth : 0;
  const y = height > 0 ? viewport.height : 0;
  return { height, width, x: 0, y };
}

let _enabled = false;
