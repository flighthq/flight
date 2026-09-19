import { createAppWindow, openWindow } from '@flighthq/app/contract';
import type { AppWindow } from '@flighthq/types/contract';

import { webHostCanvas } from './webHostCanvas';
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

describe('webHostCanvas', () => {
  it('allocates a canvas drawable sized in device pixels', () => {
    const handle = webHostCanvas.create(openPageWindow(), 320, 240);

    expect((handle as HTMLCanvasElement).width).toBe(320);
    expect((handle as HTMLCanvasElement).height).toBe(240);
  });

  it('acquires a 2D context on a canvas-backed surface', () => {
    expect(webHostCanvas.acquire(createWebSurfaceFromElement(document.createElement('canvas')))).not.toBeNull();
  });

  it('returns null from acquire when the surface is not backed by a canvas', () => {
    expect(webHostCanvas.acquire(createWebSurfaceFromElement(document.createElement('div')))).toBeNull();
  });

  it('reports a window with no document as no drawable', () => {
    expect(webHostCanvas.create(createAppWindow(), 8, 8)).toBeNull();
  });

  it('release is a no-op because the DOM owns 2D context lifetime', () => {
    const surface = createWebSurfaceFromElement(document.createElement('canvas'));
    webHostCanvas.release(surface);

    expect(webHostCanvas.acquire(surface)).not.toBeNull();
  });
});
