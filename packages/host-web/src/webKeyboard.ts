import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  SoftKeyboardChangeBackend,
  SoftKeyboardChangeSubscription,
  SoftKeyboardInfo,
  SoftKeyboardInfoBackend,
  SoftKeyboardVisibilityBackend,
  SoftKeyboardVisibilityResult,
} from '@flighthq/types/contract';

export function createWebSoftKeyboardChangeBackend(): SoftKeyboardChangeBackend & Entity {
  const out = allocateEntity<SoftKeyboardChangeBackend>();
  out.subscribe = async (listener: () => void): Promise<SoftKeyboardChangeSubscription> => {
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
  };
  return finishEntity(out);
}
export function createWebSoftKeyboardInfoBackend(): SoftKeyboardInfoBackend & Entity {
  const out = allocateEntity<SoftKeyboardInfoBackend>();
  out.getInfo = (target: SoftKeyboardInfo): SoftKeyboardInfo => {
    const geo = getWebKeyboardGeometry();
    target.height = geo.height;
    target.visible = geo.height > 0;
    target.x = geo.x;
    target.y = geo.y;
    target.width = geo.width;
    return target;
  };
  return finishEntity(out);
}

export function createWebSoftKeyboardVisibilityBackend(): SoftKeyboardVisibilityBackend & Entity {
  const out = allocateEntity<SoftKeyboardVisibilityBackend>();
  out.show = async (): Promise<SoftKeyboardVisibilityResult> => {
    const vk = getVirtualKeyboard();
    if (vk === null) return 'operation-failed';
    vk.show();
    return 'ok';
  };
  out.hide = async (): Promise<SoftKeyboardVisibilityResult> => {
    const vk = getVirtualKeyboard();
    if (vk === null) return 'operation-failed';
    vk.hide();
    return 'ok';
  };
  return finishEntity(out);
}

interface VirtualKeyboard extends EventTarget {
  readonly boundingRect: DOMRect;
  overlaysContent: boolean;
  show(): void;
  hide(): void;
}

interface WebKeyboardNavigator extends Navigator {
  virtualKeyboard?: VirtualKeyboard;
}

function getVirtualKeyboard(): VirtualKeyboard | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as WebKeyboardNavigator;
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
