import { createEntity } from '@flighthq/entity/contract';
import type { InputTargetBackend, InputTargetHandle } from '@flighthq/types/contract';

export const webInputTargetBackend = createEntity<{ prepare(target: InputTargetHandle): void }>({
  prepare(target: InputTargetHandle) {
    const element = _inputTargets.get(target);
    if (element === undefined) return;
    element.style.touchAction = 'none';
    element.style.userSelect = 'none';
    element.style.webkitUserSelect = 'none';
    (element.style as CSSStyleDeclaration & { webkitTapHighlightColor: string }).webkitTapHighlightColor =
      'transparent';
    if (element instanceof HTMLCanvasElement) element.style.transform = 'translateZ(0)';
  },
}) satisfies InputTargetBackend;

export function createWebInputTargetHandle(element: HTMLElement): InputTargetHandle {
  const target: InputTargetHandle = createEntity({ __brand: 'InputTargetHandle' as const });
  _inputTargets.set(target, element);
  return target;
}

export function resetWebInputTargetBackendForTest(): void {
  _inputTargets = new WeakMap();
}

let _inputTargets = new WeakMap<InputTargetHandle, HTMLElement>();
