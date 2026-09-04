import { exitApplicationPointerLock, lockApplicationPointer } from '@flighthq/application/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { EntityWithoutRuntime, HasInputPointerLock, InputPointerLockBackend } from '@flighthq/types/contract';

import { webHost } from './webHost';
import {
  createWebInputTargetHandle,
  resetWebInputTargetBackendForTest,
  webInputDropFileBackend,
  webInputFocusBackend,
  webInputPointerLockBackend,
  webInputTargetBackend,
  webRenderContextBackend,
  webRenderSurfaceBackend,
} from './webInputTarget';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: undefined });
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: undefined });
  resetWebInputTargetBackendForTest();
});

describe('createWebInputTargetHandle', () => {
  it('constructs an opaque Entity bound to the provider', () => {
    const element = document.createElement('div');
    const target = createWebInputTargetHandle(element);

    expect(EntityRuntimeKey in target).toBe(true);
    webInputTargetBackend.prepare(target);
    expect(element.style.touchAction).toBe('none');
  });
});

describe('resetWebInputTargetBackendForTest', () => {
  it('forgets existing target bindings', () => {
    const element = document.createElement('div');
    const target = createWebInputTargetHandle(element);

    resetWebInputTargetBackendForTest();
    webInputTargetBackend.prepare(target);

    expect(element.style.touchAction).not.toBe('none');
  });

  it('releases active event subscriptions before forgetting targets', () => {
    const element = document.createElement('div');
    const listener = vi.fn();
    webInputFocusBackend.subscribe(createWebInputTargetHandle(element), listener, vi.fn());

    resetWebInputTargetBackendForTest();
    element.dispatchEvent(new Event('focus'));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('webInputDropFileBackend', () => {
  it('forwards every dropped file name and removes the exact listeners', () => {
    const element = document.createElement('div');
    const listener = vi.fn();
    const release = webInputDropFileBackend.subscribe(createWebInputTargetHandle(element), listener);
    const event = new Event('drop', { cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [{ name: 'a.txt' }, { name: 'b.png' }] } });

    element.dispatchEvent(event);
    release();
    release();
    element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 'a.txt');
    expect(listener).toHaveBeenNthCalledWith(2, 'b.png');
  });
});

describe('webInputFocusBackend', () => {
  it('forwards focus and blur and removes both exact listeners', () => {
    const element = document.createElement('div');
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const release = webInputFocusBackend.subscribe(createWebInputTargetHandle(element), onFocus, onBlur);

    element.dispatchEvent(new Event('focus'));
    element.dispatchEvent(new Event('blur'));
    release();
    element.dispatchEvent(new Event('focus'));
    element.dispatchEvent(new Event('blur'));

    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });
});

describe('webInputPointerLockBackend', () => {
  it('does not pin the Web provider when the target is unknown', async () => {
    const target = createWebInputTargetHandle(document.createElement('div'));
    const fallbackExit = vi.fn(async () => ({ reason: 'ok' as const }));
    const fallbackBackend = (() => {
      const out = allocateEntity<any>();
      out.exit = fallbackExit;
      out.request = async () => ({ reason: 'ok' });
      return finishEntity(out);
    })();
    const fallbackHost: HasInputPointerLock = { input: { pointerLock: fallbackBackend } };
    resetWebInputTargetBackendForTest();

    await expect(lockApplicationPointer(webHost, target)).resolves.toEqual({ reason: 'target-not-found' });
    await exitApplicationPointerLock(fallbackHost);

    expect(fallbackExit).toHaveBeenCalledOnce();
  });

  it('reports API unavailability only after resolving the target', async () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'requestPointerLock', { configurable: true, value: undefined });

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({
      reason: 'api-unavailable',
    });
  });

  it.each(
    ['throw', 'reject'].flatMap((settlement) =>
      [
        ['NotAllowedError', 'denied'],
        ['SecurityError', 'denied'],
        ['WrongDocumentError', 'operation-failed'],
        ['NotSupportedError', 'operation-failed'],
        ['InvalidStateError', 'operation-failed'],
        ['UnexpectedError', 'operation-failed'],
      ].map(([name, reason]) => ({ name, reason, settlement })),
    ),
  )('classifies $settlement $name as $reason', async ({ name, reason, settlement }) => {
    const element = document.createElement('div');
    const error = { name };
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value:
        settlement === 'throw'
          ? () => {
              throw error;
            }
          : () => Promise.reject(error),
    });

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({ reason });
  });

  it('observes a legacy request error and removes both exact listeners', async () => {
    const element = document.createElement('div');
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: () => document.dispatchEvent(new Event('pointerlockerror')),
    });

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({
      reason: 'operation-failed',
    });

    const changeListener = addEventListener.mock.calls.find(([type]) => type === 'pointerlockchange')?.[1];
    const errorListener = addEventListener.mock.calls.find(([type]) => type === 'pointerlockerror')?.[1];
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockchange', changeListener);
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockerror', errorListener);
  });

  it('observes a legacy request success and removes both exact listeners', async () => {
    const element = document.createElement('div');
    let pointerLockElement: Element | null = null;
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => pointerLockElement,
    });
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: () => {
        pointerLockElement = element;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({
      reason: 'ok',
    });

    const changeListener = addEventListener.mock.calls.find(([type]) => type === 'pointerlockchange')?.[1];
    const errorListener = addEventListener.mock.calls.find(([type]) => type === 'pointerlockerror')?.[1];
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockchange', changeListener);
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockerror', errorListener);
  });

  it('falls back to the owner document for a target rooted in a plain DocumentFragment', async () => {
    const element = document.createElement('div');
    document.createDocumentFragment().appendChild(element);
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: element });
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: () => document.dispatchEvent(new Event('pointerlockchange')),
    });

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({
      reason: 'ok',
    });
  });

  it('does not treat a legacy change for another target as success', async () => {
    const element = document.createElement('div');
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.body });
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: () => document.dispatchEvent(new Event('pointerlockchange')),
    });

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('reports an already-unlocked exit as ok without requiring the API', async () => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: null });

    await expect(webInputPointerLockBackend.exit()).resolves.toEqual({ reason: 'ok' });
  });

  it('reports an active exit as unavailable when the API is missing', async () => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.body });

    await expect(webInputPointerLockBackend.exit()).resolves.toEqual({ reason: 'api-unavailable' });
  });

  it('reports exit as unavailable without a document', async () => {
    vi.stubGlobal('document', undefined);

    await expect(webInputPointerLockBackend.exit()).resolves.toEqual({ reason: 'api-unavailable' });
  });

  it('reports a synchronous exit failure and removes its exact listener', async () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.body });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        throw new Error('busy');
      },
    });

    await expect(webInputPointerLockBackend.exit()).resolves.toEqual({ reason: 'operation-failed' });

    expect(removeEventListener).toHaveBeenCalledWith('pointerlockchange', expect.any(Function));
  });

  it('reports immediate exit success and removes its exact listener', async () => {
    let pointerLockElement: Element | null = document.body;
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => pointerLockElement,
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        pointerLockElement = null;
      },
    });

    await expect(webInputPointerLockBackend.exit()).resolves.toEqual({ reason: 'ok' });

    const changeListener = addEventListener.mock.calls.find(([type]) => type === 'pointerlockchange')?.[1];
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockchange', changeListener);
  });

  it.each([
    [null, 'ok'],
    [document.body, 'operation-failed'],
  ] as const)('classifies an event-confirmed exit with state %s as %s', async (nextTarget, reason) => {
    let pointerLockElement: Element | null = document.documentElement;
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => pointerLockElement,
    });
    Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: vi.fn() });

    const outcome = webInputPointerLockBackend.exit();
    pointerLockElement = nextTarget;
    document.dispatchEvent(new Event('pointerlockchange'));

    await expect(outcome).resolves.toEqual({ reason });
    const changeListener = addEventListener.mock.calls.find(([type]) => type === 'pointerlockchange')?.[1];
    expect(removeEventListener).toHaveBeenCalledWith('pointerlockchange', changeListener);
    expect(addEventListener.mock.calls.some(([type]) => type === 'pointerlockerror')).toBe(false);
  });

  it('requests lock through a structurally detected thenable', async () => {
    const element = document.createElement('div');
    const thenable = new Proxy<Record<PropertyKey, unknown>>(Object.create(null), {
      get: (_target, key) => (key === 'then' ? (resolve: () => void) => resolve() : undefined),
    });
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: () => thenable,
    });

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({
      reason: 'ok',
    });
  });

  it('requests lock for the opaque target through the modern Promise API', async () => {
    const element = document.createElement('div');
    const request = vi.fn().mockResolvedValue(undefined);
    element.requestPointerLock = request;

    await expect(webInputPointerLockBackend.request(createWebInputTargetHandle(element))).resolves.toEqual({
      reason: 'ok',
    });

    expect(request).toHaveBeenCalledOnce();
  });

  it('reports an unknown provider-bound target', async () => {
    const target = createWebInputTargetHandle(document.createElement('div'));
    resetWebInputTargetBackendForTest();

    await expect(webInputPointerLockBackend.request(target)).resolves.toEqual({ reason: 'target-not-found' });
  });
});

describe('webInputTargetBackend', () => {
  it('prepares the bound element without exposing DOM through the neutral contract', () => {
    const element = document.createElement('div');

    webInputTargetBackend.prepare(createWebInputTargetHandle(element));

    expect(element.style.touchAction).toBe('none');
    expect(element.style.userSelect).toBe('none');
    expect(element.style.webkitUserSelect).toBe('none');
    expect((element.style as CSSStyleDeclaration & { webkitTapHighlightColor: string }).webkitTapHighlightColor).toBe(
      'transparent',
    );
  });

  it('applies the canvas-only compositing preparation behind the provider boundary', () => {
    const canvas = document.createElement('canvas');
    const div = document.createElement('div');

    webInputTargetBackend.prepare(createWebInputTargetHandle(canvas));
    webInputTargetBackend.prepare(createWebInputTargetHandle(div));

    expect(canvas.style.transform).toBe('translateZ(0)');
    expect(div.style.transform).toBe('');
  });

  it('is an Entity provider value', () => {
    expect(EntityRuntimeKey in webInputTargetBackend).toBe(true);
    expect(webHost.input.target).toBe(webInputTargetBackend);
  });

  it('keeps command and event slots separate while every provider remains an Entity', () => {
    const providers = [
      webInputDropFileBackend,
      webInputFocusBackend,
      webInputPointerLockBackend,
      webRenderContextBackend,
      webRenderSurfaceBackend,
    ];

    expect(providers.every((provider) => EntityRuntimeKey in provider)).toBe(true);
    expect(webHost.input.dropFile).toBe(webInputDropFileBackend);
    expect(webHost.input.focus).toBe(webInputFocusBackend);
    expect(webHost.input.pointerLock).toBe(webInputPointerLockBackend);
    expect(webHost.graphics.renderContext).toBe(webRenderContextBackend);
    expect(webHost.graphics.renderSurface).toBe(webRenderSurfaceBackend);
    expect(new Set(providers).size).toBe(5);
  });
});

describe('webRenderContextBackend', () => {
  it('forwards context loss/restoration and removes the exact canvas listeners', () => {
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const release = webRenderContextBackend.subscribe(createWebInputTargetHandle(canvas), onLost, onRestored);
    const lost = new Event('webglcontextlost', { cancelable: true });

    canvas.dispatchEvent(lost);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    release();
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledOnce();
    expect(onRestored).toHaveBeenCalledOnce();
  });

  it('truthfully leaves a non-canvas target inert', () => {
    const listener = vi.fn();
    const release = webRenderContextBackend.subscribe(
      createWebInputTargetHandle(document.createElement('div')),
      listener,
      listener,
    );

    expect(release).toBeTypeOf('function');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('webRenderSurfaceBackend', () => {
  it('sizes a bound canvas backing store and leaves a non-canvas target inert', () => {
    const canvas = document.createElement('canvas');
    const div = document.createElement('div');

    webRenderSurfaceBackend.resize(createWebInputTargetHandle(canvas), 640, 480);
    webRenderSurfaceBackend.resize(createWebInputTargetHandle(div), 1, 1);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });
});
