import { createEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  SoftKeyboardChangeBackend,
  SoftKeyboardChangeSubscription,
  SoftKeyboardInfo,
  SoftKeyboardInfoBackend,
  SoftKeyboardVisibilityBackend,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';
import type { EntityRuntimeKey } from '@flighthq/types/contract';

type OmitRuntime<T> = Omit<T, typeof EntityRuntimeKey>;

export function createWebSoftKeyboardChangeBackend(): SoftKeyboardChangeBackend & Entity {
  return createEntity({
    async subscribe(listener: () => void): Promise<SoftKeyboardChangeSubscription> {
      if (typeof window === 'undefined') return { result: 'acquisition-failed', unsubscribe: null };
      const virtualKeyboard = getVirtualKeyboard();
      if (virtualKeyboard !== null) {
        virtualKeyboard.addEventListener('geometrychange', listener);
        return { result: 'ok', unsubscribe: () => virtualKeyboard.removeEventListener('geometrychange', listener) };
      }
      const viewport = window.visualViewport;
      if (viewport === undefined || viewport === null) return { result: 'acquisition-failed', unsubscribe: null };
      viewport.addEventListener('resize', listener);
      viewport.addEventListener('scroll', listener);
      return {
        result: 'ok',
        unsubscribe: () => {
          viewport.removeEventListener('resize', listener);
          viewport.removeEventListener('scroll', listener);
        },
      };
    },
  } satisfies OmitRuntime<SoftKeyboardChangeBackend>);
}
export function createWebSoftKeyboardInfoBackend(): SoftKeyboardInfoBackend & Entity {
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
  } satisfies OmitRuntime<SoftKeyboardInfoBackend>);
}

export function createWebSoftKeyboardVisibilityBackend(): SoftKeyboardVisibilityBackend & Entity {
  return createEntity({
    async show(): Promise<SoftKeyboardVisibilityResult> {
      const vk = getVirtualKeyboard();
      if (vk === null) return 'operation-failed';
      vk.show();
      return 'ok';
    },
    async hide(): Promise<SoftKeyboardVisibilityResult> {
      const vk = getVirtualKeyboard();
      if (vk === null) return 'operation-failed';
      vk.hide();
      return 'ok';
    },
  } satisfies OmitRuntime<SoftKeyboardVisibilityBackend>);
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
