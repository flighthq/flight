import { EntityRuntimeKey } from '@flighthq/types/contract';

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
  vi.restoreAllMocks();
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
  it('requests lock for the opaque target and exits through the document', async () => {
    const element = document.createElement('div');
    const request = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    element.requestPointerLock = request;
    Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: exit });

    await webInputPointerLockBackend.request(createWebInputTargetHandle(element));
    await webInputPointerLockBackend.exit();

    expect(request).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('resolves when the target is unknown or the browser operations are unavailable', async () => {
    const target = createWebInputTargetHandle(document.createElement('div'));
    resetWebInputTargetBackendForTest();
    Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: undefined });

    await expect(webInputPointerLockBackend.request(target)).resolves.toBeUndefined();
    await expect(webInputPointerLockBackend.exit()).resolves.toBeUndefined();
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
