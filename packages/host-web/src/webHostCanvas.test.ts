import { createAppWindow, openWindow } from '@flighthq/app/contract';
import type { AppWindow } from '@flighthq/types/contract';

import { createWebHostCanvas, initializeWebHostCanvas, webHostCanvas } from './webHostCanvas';
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

describe('initializeWebHostCanvas', () => {
  it('fills every capability operation onto a construction', () => {
    const out = {} as Parameters<typeof initializeWebHostCanvas>[0];
    initializeWebHostCanvas(out);

    for (const op of ['acquire', 'create', 'release'] as const) expect(typeof out[op]).toBe('function');
  });
});

describe('webHostCanvas', () => {
  it('release is a no-op because the DOM owns 2D context lifetime', () => {
    const surface = createWebSurfaceFromElement(document.createElement('canvas'));
    webHostCanvas.release(surface);

    expect(webHostCanvas.acquire(surface)).not.toBeNull();
  });
});
