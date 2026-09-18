import { createAppWindow, openWindow } from '@flighthq/app/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { AppWindow } from '@flighthq/types/contract';

import { createWebHostGl, initializeWebHostGl, webHostGl } from './webHostGl';
import { createWebSurfaceFromElement } from './webSurfaceHandle';
import { resetWebWindowBackendForTest, webHostWindowGeometry, webHostWindowLifecycle } from './webWindow';

let pageWindow: AppWindow | undefined;

function openPageWindow(): AppWindow {
  if (pageWindow === undefined) {
    // One page Window binds to exactly one AppWindow, and the binding outlives the file that made it, so
    // this releases whatever an earlier file attached before claiming it here.
    resetWebWindowBackendForTest();
    pageWindow = createAppWindow();
    openWindow(webHostWindowLifecycle, webHostWindowGeometry, pageWindow, {});
  }
  return pageWindow;
}

describe('createWebHostGl', () => {
  it('returns an Entity capability', () => {
    expect(EntityRuntimeKey in createWebHostGl()).toBe(true);
  });

  it('allocates a canvas drawable sized in device pixels', () => {
    const handle = createWebHostGl().create(openPageWindow(), 800, 500);

    expect((handle as HTMLCanvasElement).width).toBe(800);
    expect((handle as HTMLCanvasElement).height).toBe(500);
  });

  // The two sentinels stay distinct: null from create means no drawable, null from acquire means no
  // context on a drawable that exists.
  it('reports a window with no document as no drawable', () => {
    expect(createWebHostGl().create(createAppWindow(), 8, 8)).toBeNull();
  });

  it('returns null from acquire when the surface is not backed by a canvas', () => {
    const surface = createWebSurfaceFromElement(document.createElement('div'));

    expect(createWebHostGl().acquire(surface)).toBeNull();
  });

  it('subscribes to context loss on the surface drawable and unsubscribes cleanly', () => {
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    const release = createWebHostGl().subscribe(createWebSurfaceFromElement(canvas), onLost, () => {});

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onLost).toHaveBeenCalledTimes(1);

    release();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('subscribe is inert for a surface with no canvas', () => {
    const release = createWebHostGl().subscribe(
      createWebSurfaceFromElement(document.createElement('div')),
      () => {},
      () => {},
    );

    expect(() => release()).not.toThrow();
  });
});

describe('initializeWebHostGl', () => {
  it('fills every capability operation onto a construction', () => {
    const out = {} as Parameters<typeof initializeWebHostGl>[0];
    initializeWebHostGl(out);

    for (const op of ['acquire', 'create', 'release', 'subscribe'] as const) expect(typeof out[op]).toBe('function');
  });
});

describe('webHostGl', () => {
  it('is an Entity capability value', () => {
    expect(EntityRuntimeKey in webHostGl).toBe(true);
  });

  it('release is a no-op because the DOM owns WebGL context lifetime', () => {
    expect(() => webHostGl.release(createWebSurfaceFromElement(document.createElement('canvas')))).not.toThrow();
  });
});
