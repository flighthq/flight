import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  InputDropFileBackend,
  InputFocusBackend,
  InputPointerLockBackend,
  InputPointerLockExitOutcome,
  InputPointerLockRequestOutcome,
  InputTargetBackend,
  InputTargetHandle,
  RenderContextBackend,
  RenderSurfaceBackend,
} from '@flighthq/types/contract';

interface WebInputTargetStyle extends CSSStyleDeclaration {
  webkitTapHighlightColor: string;
}

export const webInputDropFileBackend = (() => {
  const out = allocateEntity<InputDropFileBackend>();
  out.subscribe = (target: InputTargetHandle, listener: (path: string) => void) => {
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
  };
  return finishEntity(out);
})();

export const webInputFocusBackend = (() => {
  const out = allocateEntity<InputFocusBackend>();
  out.subscribe = (target: InputTargetHandle, onFocus: () => void, onBlur: () => void) => {
    const element = _inputTargets.get(target);
    if (element === undefined) return noop;
    element.addEventListener('focus', onFocus);
    element.addEventListener('blur', onBlur);
    return trackWebInputTargetSubscription(() => {
      element.removeEventListener('focus', onFocus);
      element.removeEventListener('blur', onBlur);
    });
  };
  return finishEntity(out);
})();

export const webInputPointerLockBackend = (() => {
  const out = allocateEntity<InputPointerLockBackend>();
  out.exit = () => {
    if (typeof document === 'undefined') return Promise.resolve(POINTER_LOCK_API_UNAVAILABLE);
    if (document.pointerLockElement === null) return Promise.resolve(POINTER_LOCK_OK);
    const exitPointerLock = document.exitPointerLock;
    if (typeof exitPointerLock !== 'function') return Promise.resolve(POINTER_LOCK_API_UNAVAILABLE);
    const observation = observePointerLockExit(document);
    try {
      exitPointerLock.call(document);
    } catch {
      observation.release();
      return Promise.resolve(POINTER_LOCK_OPERATION_FAILED);
    }
    if (document.pointerLockElement === null) {
      observation.release();
      return Promise.resolve(POINTER_LOCK_OK);
    }
    return observation.outcome;
  };
  out.request = (target: InputTargetHandle) => {
    const element = _inputTargets.get(target);
    if (element === undefined) return Promise.resolve(POINTER_LOCK_TARGET_NOT_FOUND);
    const requestPointerLock = element.requestPointerLock;
    if (typeof requestPointerLock !== 'function') return Promise.resolve(POINTER_LOCK_API_UNAVAILABLE);
    const observation = observeLegacyPointerLockRequest(element);
    let result: unknown;
    try {
      result = requestPointerLock.call(element);
      if (!isPromiseLike(result)) return observation.outcome;
    } catch (error) {
      observation.release();
      return Promise.resolve(classifyPointerLockRequestFailure(error));
    }
    observation.release();
    return Promise.resolve(result).then(
      () => POINTER_LOCK_OK,
      (error: unknown) => classifyPointerLockRequestFailure(error),
    );
  };
  return finishEntity(out);
})();

export const webInputTargetBackend = (() => {
  const out = allocateEntity<InputTargetBackend>();
  out.prepare = (target: InputTargetHandle) => {
    const element = _inputTargets.get(target);
    if (element === undefined) return;
    element.style.touchAction = 'none';
    element.style.userSelect = 'none';
    element.style.webkitUserSelect = 'none';
    (element.style as WebInputTargetStyle).webkitTapHighlightColor = 'transparent';
    if (element instanceof HTMLCanvasElement) element.style.transform = 'translateZ(0)';
  };
  return finishEntity(out);
})();

export const webRenderContextBackend = (() => {
  const out = allocateEntity<RenderContextBackend>();
  out.subscribe = (target: InputTargetHandle, onLost: () => void, onRestored: () => void) => {
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
  };
  return finishEntity(out);
})();

export const webRenderSurfaceBackend = (() => {
  const out = allocateEntity<RenderSurfaceBackend>();
  out.resize = (target: InputTargetHandle, width: number, height: number) => {
    const element = _inputTargets.get(target);
    if (element === undefined || typeof HTMLCanvasElement === 'undefined' || !(element instanceof HTMLCanvasElement)) {
      return;
    }
    element.width = width;
    element.height = height;
  };
  return finishEntity(out);
})();

export function createWebInputTargetHandle(element: HTMLElement): InputTargetHandle {
  const target = allocateEntity<InputTargetHandle>();
  target.__brand = 'InputTargetHandle' as const;
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

function classifyPointerLockRequestFailure(error: unknown): InputPointerLockRequestOutcome {
  const name = typeof error === 'object' && error !== null ? (error as { readonly name?: unknown }).name : undefined;
  return name === 'NotAllowedError' || name === 'SecurityError' ? POINTER_LOCK_DENIED : POINTER_LOCK_OPERATION_FAILED;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    typeof (value as { readonly then?: unknown }).then === 'function'
  );
}

function observeLegacyPointerLockRequest(element: HTMLElement): {
  readonly outcome: Promise<InputPointerLockRequestOutcome>;
  release(): void;
} {
  const ownerDocument = element.ownerDocument;
  let active = true;
  let resolveOutcome: (outcome: InputPointerLockRequestOutcome) => void = noop;
  const release = (): void => {
    if (!active) return;
    active = false;
    ownerDocument.removeEventListener('pointerlockchange', onChange);
    ownerDocument.removeEventListener('pointerlockerror', onError);
  };
  const settle = (outcome: InputPointerLockRequestOutcome): void => {
    if (!active) return;
    release();
    resolveOutcome(outcome);
  };
  const onChange = (): void => settle(isPointerLockTarget(element) ? POINTER_LOCK_OK : POINTER_LOCK_OPERATION_FAILED);
  const onError = (): void => settle(POINTER_LOCK_OPERATION_FAILED);
  const outcome = new Promise<InputPointerLockRequestOutcome>((resolve) => {
    resolveOutcome = resolve;
  });
  ownerDocument.addEventListener('pointerlockchange', onChange);
  ownerDocument.addEventListener('pointerlockerror', onError);
  return { outcome, release };
}

function observePointerLockExit(ownerDocument: Document): {
  readonly outcome: Promise<InputPointerLockExitOutcome>;
  release(): void;
} {
  let active = true;
  let resolveOutcome: (outcome: InputPointerLockExitOutcome) => void = noop;
  const release = (): void => {
    if (!active) return;
    active = false;
    ownerDocument.removeEventListener('pointerlockchange', onChange);
  };
  const onChange = (): void => {
    if (!active) return;
    release();
    resolveOutcome(ownerDocument.pointerLockElement === null ? POINTER_LOCK_OK : POINTER_LOCK_OPERATION_FAILED);
  };
  const outcome = new Promise<InputPointerLockExitOutcome>((resolve) => {
    resolveOutcome = resolve;
  });
  ownerDocument.addEventListener('pointerlockchange', onChange);
  return { outcome, release };
}

function isPointerLockTarget(element: HTMLElement): boolean {
  const root = element.getRootNode();
  const pointerLockRoot: DocumentOrShadowRoot =
    root instanceof Document || root instanceof ShadowRoot ? root : element.ownerDocument;
  return pointerLockRoot.pointerLockElement === element;
}

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

const POINTER_LOCK_API_UNAVAILABLE = { reason: 'api-unavailable' } as const;
const POINTER_LOCK_DENIED = { reason: 'denied' } as const;
const POINTER_LOCK_OK = { reason: 'ok' } as const;
const POINTER_LOCK_OPERATION_FAILED = { reason: 'operation-failed' } as const;
const POINTER_LOCK_TARGET_NOT_FOUND = { reason: 'target-not-found' } as const;
