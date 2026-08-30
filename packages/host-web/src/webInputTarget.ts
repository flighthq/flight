import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  InputDropFileBackend,
  InputFocusBackend,
  InputPointerLockBackend,
  InputTargetBackend,
  InputTargetHandle,
  RenderContextBackend,
  RenderSurfaceBackend,
} from '@flighthq/types/contract';

export const webInputDropFileBackend = createEntity<EntityWithoutRuntime<InputDropFileBackend>>({
  subscribe(target: InputTargetHandle, listener: (path: string) => void) {
    const element = _inputTargets.get(target);
    if (element === undefined) return noop;
    const onDragOver = (event: DragEvent): void => event.preventDefault();
    const onDrop = (event: DragEvent): void => {
      event.preventDefault();
      for (const file of Array.from(event.dataTransfer?.files ?? [])) listener(file.name);
    };
    element.addEventListener('dragover', onDragOver);
    element.addEventListener('drop', onDrop);
    return trackWebInputTargetSubscription(() => {
      element.removeEventListener('dragover', onDragOver);
      element.removeEventListener('drop', onDrop);
    });
  },
}) satisfies InputDropFileBackend;

export const webInputFocusBackend = createEntity<EntityWithoutRuntime<InputFocusBackend>>({
  subscribe(target: InputTargetHandle, onFocus: () => void, onBlur: () => void) {
    const element = _inputTargets.get(target);
    if (element === undefined) return noop;
    element.addEventListener('focus', onFocus);
    element.addEventListener('blur', onBlur);
    return trackWebInputTargetSubscription(() => {
      element.removeEventListener('focus', onFocus);
      element.removeEventListener('blur', onBlur);
    });
  },
}) satisfies InputFocusBackend;

export const webInputPointerLockBackend = createEntity<EntityWithoutRuntime<InputPointerLockBackend>>({
  exit() {
    if (typeof document === 'undefined' || typeof document.exitPointerLock !== 'function') return Promise.resolve();
    document.exitPointerLock();
    return Promise.resolve();
  },
  request(target: InputTargetHandle) {
    const element = _inputTargets.get(target);
    if (element === undefined || typeof element.requestPointerLock !== 'function') return Promise.resolve();
    const result = element.requestPointerLock();
    return (result instanceof Promise ? result : Promise.resolve()) as Promise<void>;
  },
}) satisfies InputPointerLockBackend;

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

export const webRenderContextBackend = createEntity<EntityWithoutRuntime<RenderContextBackend>>({
  subscribe(target: InputTargetHandle, onLost: () => void, onRestored: () => void) {
    const element = _inputTargets.get(target);
    if (element === undefined || typeof HTMLCanvasElement === 'undefined' || !(element instanceof HTMLCanvasElement)) {
      return noop;
    }
    const onContextLost = (event: Event): void => {
      event.preventDefault();
      onLost();
    };
    element.addEventListener('webglcontextlost', onContextLost);
    element.addEventListener('webglcontextrestored', onRestored);
    return trackWebInputTargetSubscription(() => {
      element.removeEventListener('webglcontextlost', onContextLost);
      element.removeEventListener('webglcontextrestored', onRestored);
    });
  },
}) satisfies RenderContextBackend;

export const webRenderSurfaceBackend = createEntity<EntityWithoutRuntime<RenderSurfaceBackend>>({
  resize(target: InputTargetHandle, width: number, height: number) {
    const element = _inputTargets.get(target);
    if (element === undefined || typeof HTMLCanvasElement === 'undefined' || !(element instanceof HTMLCanvasElement)) {
      return;
    }
    element.width = width;
    element.height = height;
  },
}) satisfies RenderSurfaceBackend;

export function createWebInputTargetHandle(element: HTMLElement): InputTargetHandle {
  const target: InputTargetHandle = createEntity({ __brand: 'InputTargetHandle' as const });
  _inputTargets.set(target, element);
  return target;
}

export function resetWebInputTargetBackendForTest(): void {
  for (const cleanup of [..._inputTargetSubscriptionCleanups]) cleanup();
  _inputTargetSubscriptionCleanups.clear();
  _inputTargets = new WeakMap();
}

let _inputTargets = new WeakMap<InputTargetHandle, HTMLElement>();
const _inputTargetSubscriptionCleanups = new Set<() => void>();

function noop(): void {}

function trackWebInputTargetSubscription(cleanup: () => void): () => void {
  let active = true;
  const trackedCleanup = (): void => {
    if (!active) return;
    active = false;
    _inputTargetSubscriptionCleanups.delete(trackedCleanup);
    cleanup();
  };
  _inputTargetSubscriptionCleanups.add(trackedCleanup);
  return trackedCleanup;
}
