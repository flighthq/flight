import { createApplicationWindow, openWindow } from '@flighthq/application/contract';
import { getSurfaceHandle } from '@flighthq/surface/contract';
import type { ApplicationWindow } from '@flighthq/types/contract';

import {
  allocateWebSurfaceCanvas,
  createWebSurfaceFromElement,
  getWebSurfaceCanvasHandle,
  getWebSurfaceElementHandle,
} from './webSurfaceHandle';
import { webHostWindowGeometry, webHostWindowLifecycle } from './webWindow';

let pageWindow: ApplicationWindow | undefined;

function openPageWindow(): ApplicationWindow {
  if (pageWindow === undefined) {
    pageWindow = createApplicationWindow();
    openWindow(webHostWindowLifecycle, webHostWindowGeometry, pageWindow, {});
  }
  return pageWindow;
}

describe('allocateWebSurfaceCanvas', () => {
  it('creates a canvas in the window document, sized in device pixels', () => {
    const handle = allocateWebSurfaceCanvas(openPageWindow(), 1600, 1000);

    expect(handle).toBeInstanceOf(HTMLCanvasElement);
    expect((handle as HTMLCanvasElement).width).toBe(1600);
    expect((handle as HTMLCanvasElement).height).toBe(1000);
  });

  it('does not present what it allocates', () => {
    const handle = allocateWebSurfaceCanvas(openPageWindow(), 8, 8) as HTMLCanvasElement;

    expect(handle.parentElement).toBeNull();
    expect(handle.style.width).toBe('');
  });

  // The window argument is a real lookup, not decoration: a window that was never opened has no document
  // to create through, and that is the same sentinel as a host that cannot allocate at all.
  it('returns null for a window that was never opened', () => {
    expect(allocateWebSurfaceCanvas(createApplicationWindow(), 8, 8)).toBeNull();
  });
});

describe('createWebSurfaceFromElement', () => {
  it('adopts an element the caller owns, putting it on the surface runtime', () => {
    const canvas = document.createElement('canvas');
    const surface = createWebSurfaceFromElement(canvas);

    expect(getSurfaceHandle(surface)).toBe(canvas);
    expect(Object.keys(surface)).toEqual([]);
  });
});

describe('getWebSurfaceCanvasHandle', () => {
  it('narrows the opaque handle back to a canvas', () => {
    const canvas = document.createElement('canvas');

    expect(getWebSurfaceCanvasHandle(createWebSurfaceFromElement(canvas))).toBe(canvas);
  });

  it('returns null when the drawable is not a canvas', () => {
    expect(getWebSurfaceCanvasHandle(createWebSurfaceFromElement(document.createElement('div')))).toBeNull();
  });
});

describe('getWebSurfaceElementHandle', () => {
  it('returns any element drawable, canvas or not', () => {
    const div = document.createElement('div');

    expect(getWebSurfaceElementHandle(createWebSurfaceFromElement(div))).toBe(div);
  });
});
