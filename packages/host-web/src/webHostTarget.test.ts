import { exitApplicationPointerLock, lockApplicationPointer } from '@flighthq/application/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { EntityWithoutRuntime, HostInputPointerLockCapability, HostTarget } from '@flighthq/types/contract';

import { webHost } from './webHost';
import {
  createWebHostTarget,
  initializeWebHostTarget,
  resetWebHostTargetBackendForTest,
  webHostInputDropFile,
  webHostInputFocus,
  webHostInputPointerLock,
  webHostTarget,
  webHostGl,
  webHostSurface,
} from './webHostTarget';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: undefined });
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: undefined });
  resetWebHostTargetBackendForTest();
});

// The canvas getContext mock returns this; acquire only has to hand back what the canvas produced.
const FAKE_GL = { fake: 'gl' } as unknown as WebGL2RenderingContext;

describe('createWebHostTarget', () => {
  it('constructs an opaque Entity bound to the provider', () => {
    const element = document.createElement('div');
    const target = createWebHostTarget(element);

    expect(EntityRuntimeKey in target).toBe(true);
    webHostTarget.prepare(target);
    expect(element.style.touchAction).toBe('none');
  });
});

describe('initializeWebHostTarget', () => {
  it('is the construction initializer of createWebHostTarget', () => {
    expect(typeof initializeWebHostTarget).toBe('function');
  });
});

describe('resetWebHostTargetBackendForTest', () => {
  it('forgets existing target bindings', () => {
    const element = document.createElement('div');
    const target = createWebHostTarget(element);

    resetWebHostTargetBackendForTest();
    webHostTarget.prepare(target);

    expect(element.style.touchAction).not.toBe('none');
  });

  it('releases active event subscriptions before forgetting targets', () => {
    const element = document.createElement('div');
    const listener = vi.fn();
    webHostInputFocus.subscribe(createWebHostTarget(element), listener, vi.fn());

    resetWebHostTargetBackendForTest();
    element.dispatchEvent(new Event('focus'));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('webHostGl', () => {
  it('acquires the canvas context the target was registered with', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn().mockReturnValue(FAKE_GL) as typeof canvas.getContext;

    expect(webHostGl.acquire(createWebHostTarget(canvas))).toBe(FAKE_GL);
  });

  it('reports null for a target this host never registered', () => {
    expect(webHostGl.acquire(finishEntity(allocateEntity<HostTarget>()))).toBeNull();
  });

  it('reports null for a registered target that is not a canvas', () => {
    expect(webHostGl.acquire(createWebHostTarget(document.createElement('div')))).toBeNull();
  });

  it('degrades release to a no-op because the DOM owns context lifetime', () => {
    const target = createWebHostTarget(document.createElement('canvas'));

    expect(() => webHostGl.release(target)).not.toThrow();
  });

  it('forwards context loss/restoration and removes the exact canvas listeners', () => {
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const release = webHostGl.subscribe(createWebHostTarget(canvas), onLost, onRestored);
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
    const release = webHostGl.subscribe(createWebHostTarget(document.createElement('div')), listener, listener);

    expect(release).toBeTypeOf('function');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('webHostInputDropFile', () => {
  it('forwards every dropped file name and removes the exact listeners', () => {
    const element = document.createElement('div');
    const listener = vi.fn();
    const release = webHostInputDropFile.subscribe(createWebHostTarget(element), listener);
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

describe('webHostInputFocus', () => {
  it('forwards focus and blur and removes both exact listeners', () => {
    const element = document.createElement('div');
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const release = webHostInputFocus.subscribe(createWebHostTarget(element), onFocus, onBlur);

    element.dispatchEvent(new Event('focus'));
    element.dispatchEvent(new Event('blur'));
    release();
    element.dispatchEvent(new Event('focus'));
    element.dispatchEvent(new Event('blur'));

    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });
});

describe('webHostInputPointerLock', () => {
  it('does not pin the Web provider when the target is unknown', async () => {
    const target = createWebHostTarget(document.createElement('div'));
    const fallbackExit = vi.fn(async () => ({ reason: 'ok' as const }));
    const fallbackBackend = (() => {
      const out = allocateEntity<any>();
      out.exit = fallbackExit;
      out.request = async () => ({ reason: 'ok' });
      return finishEntity(out);
    })();
    const fallbackHost: { readonly input: { readonly pointerLock: HostInputPointerLockCapability } } = {
      input: { pointerLock: fallbackBackend },
    };
    resetWebHostTargetBackendForTest();

    await expect(lockApplicationPointer(webHost.input.pointerLock, target)).resolves.toEqual({
      reason: 'target-not-found',
    });
    await exitApplicationPointerLock(fallbackHost.input.pointerLock);

    expect(fallbackExit).toHaveBeenCalledOnce();
  });

  it('reports API unavailability only after resolving the target', async () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'requestPointerLock', { configurable: true, value: undefined });

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({
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

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({ reason });
  });

  it('observes a legacy request error and removes both exact listeners', async () => {
    const element = document.createElement('div');
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    Object.defineProperty(element, 'requestPointerLock', {
      configurable: true,
      value: () => document.dispatchEvent(new Event('pointerlockerror')),
    });

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({
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

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({
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

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({
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

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('reports an already-unlocked exit as ok without requiring the API', async () => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: null });

    await expect(webHostInputPointerLock.exit()).resolves.toEqual({ reason: 'ok' });
  });

  it('reports an active exit as unavailable when the API is missing', async () => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.body });

    await expect(webHostInputPointerLock.exit()).resolves.toEqual({ reason: 'api-unavailable' });
  });

  it('reports exit as unavailable without a document', async () => {
    vi.stubGlobal('document', undefined);

    await expect(webHostInputPointerLock.exit()).resolves.toEqual({ reason: 'api-unavailable' });
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

    await expect(webHostInputPointerLock.exit()).resolves.toEqual({ reason: 'operation-failed' });

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

    await expect(webHostInputPointerLock.exit()).resolves.toEqual({ reason: 'ok' });

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

    const outcome = webHostInputPointerLock.exit();
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

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({
      reason: 'ok',
    });
  });

  it('requests lock for the opaque target through the modern Promise API', async () => {
    const element = document.createElement('div');
    const request = vi.fn().mockResolvedValue(undefined);
    element.requestPointerLock = request;

    await expect(webHostInputPointerLock.request(createWebHostTarget(element))).resolves.toEqual({
      reason: 'ok',
    });

    expect(request).toHaveBeenCalledOnce();
  });

  it('reports an unknown provider-bound target', async () => {
    const target = createWebHostTarget(document.createElement('div'));
    resetWebHostTargetBackendForTest();

    await expect(webHostInputPointerLock.request(target)).resolves.toEqual({ reason: 'target-not-found' });
  });
});

describe('webHostSurface', () => {
  it('sizes a bound canvas backing store and leaves a non-canvas target inert', () => {
    const canvas = document.createElement('canvas');
    const div = document.createElement('div');

    webHostSurface.resize(createWebHostTarget(canvas), 640, 480);
    webHostSurface.resize(createWebHostTarget(div), 1, 1);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });
});
describe('webHostTarget', () => {
  it('prepares the bound element without exposing DOM through the neutral contract', () => {
    const element = document.createElement('div');

    webHostTarget.prepare(createWebHostTarget(element));

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

    webHostTarget.prepare(createWebHostTarget(canvas));
    webHostTarget.prepare(createWebHostTarget(div));

    expect(canvas.style.transform).toBe('translateZ(0)');
    expect(div.style.transform).toBe('');
  });

  it('is an Entity provider value', () => {
    expect(EntityRuntimeKey in webHostTarget).toBe(true);
    expect(webHost.input.target).toBe(webHostTarget);
  });

  it('keeps command and event slots separate while every provider remains an Entity', () => {
    const providers = [webHostInputDropFile, webHostInputFocus, webHostInputPointerLock, webHostGl, webHostSurface];

    expect(providers.every((provider) => EntityRuntimeKey in provider)).toBe(true);
    expect(webHost.input.dropFile).toBe(webHostInputDropFile);
    expect(webHost.input.focus).toBe(webHostInputFocus);
    expect(webHost.input.pointerLock).toBe(webHostInputPointerLock);
    expect(webHost.gl.context).toBe(webHostGl);
    expect(webHost.surface.resize).toBe(webHostSurface);
    expect(new Set(providers).size).toBe(5);
  });
});
