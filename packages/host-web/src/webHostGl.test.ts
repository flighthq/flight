import { createAppWindow, openWindow } from '@flighthq/app/contract';
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

describe('initializeWebHostGl', () => {
  it('fills every capability operation onto a construction', () => {
    const out = {} as Parameters<typeof initializeWebHostGl>[0];
    initializeWebHostGl(out);

    for (const op of ['acquire', 'create', 'release', 'subscribe'] as const) expect(typeof out[op]).toBe('function');
  });
});

describe('webHostGl', () => {
  it('release is a no-op because the DOM owns WebGL context lifetime', () => {
    expect(() => webHostGl.release(createWebSurfaceFromElement(document.createElement('canvas')))).not.toThrow();
  });
});
