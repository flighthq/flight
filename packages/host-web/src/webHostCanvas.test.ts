import { createApplicationWindow, openWindow } from '@flighthq/application/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { ApplicationWindow } from '@flighthq/types/contract';

import { createWebHostCanvas, initializeWebHostCanvas, webHostCanvas } from './webHostCanvas';
import { createWebSurfaceFromElement } from './webSurfaceHandle';
import { webHostWindowGeometry, webHostWindowLifecycle } from './webWindow';

let pageWindow: ApplicationWindow | undefined;

function openPageWindow(): ApplicationWindow {
  if (pageWindow === undefined) {
    pageWindow = createApplicationWindow();
    openWindow(webHostWindowLifecycle, webHostWindowGeometry, pageWindow, {});
  }
  return pageWindow;
}

describe('createWebHostCanvas', () => {
  it('returns an Entity capability', () => {
    expect(EntityRuntimeKey in createWebHostCanvas()).toBe(true);
  });

  it('allocates a canvas drawable sized in device pixels', () => {
    const handle = createWebHostCanvas().create(openPageWindow(), 320, 240);

    expect((handle as HTMLCanvasElement).width).toBe(320);
    expect((handle as HTMLCanvasElement).height).toBe(240);
  });

  it('acquires a 2D context on a canvas-backed surface', () => {
    expect(createWebHostCanvas().acquire(createWebSurfaceFromElement(document.createElement('canvas')))).not.toBeNull();
  });

  it('returns null from acquire when the surface is not backed by a canvas', () => {
    expect(createWebHostCanvas().acquire(createWebSurfaceFromElement(document.createElement('div')))).toBeNull();
  });

  it('reports a window with no document as no drawable', () => {
    expect(createWebHostCanvas().create(createApplicationWindow(), 8, 8)).toBeNull();
  });
});

describe('initializeWebHostCanvas', () => {
  it('fills every capability operation onto a construction', () => {
    const out = {} as Parameters<typeof initializeWebHostCanvas>[0];
    initializeWebHostCanvas(out);

    for (const op of ['acquire', 'create', 'release'] as const) expect(typeof out[op]).toBe('function');
  });
});

describe('webHostCanvas', () => {
  it('is an Entity capability value', () => {
    expect(EntityRuntimeKey in webHostCanvas).toBe(true);
  });

  it('release is a no-op because the DOM owns 2D context lifetime', () => {
    const surface = createWebSurfaceFromElement(document.createElement('canvas'));
    webHostCanvas.release(surface);

    expect(webHostCanvas.acquire(surface)).not.toBeNull();
  });
});
