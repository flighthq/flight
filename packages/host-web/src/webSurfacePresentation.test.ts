import type { Surface } from '@flighthq/types/contract';

import { webHostCanvas } from './webHostCanvas';
import { createWebHostTargetFromElement, resetWebHostTargetBackendForTest } from './webHostTarget';
import {
  appendWebSurface,
  getWebSurfaceCanvas,
  getWebSurfaceElement,
  setWebSurfaceDisplaySize,
} from './webSurfacePresentation';

afterEach(() => {
  document.body.replaceChildren();
  resetWebHostTargetBackendForTest();
});

function surfaceOver(element: HTMLElement): Surface {
  return { target: createWebHostTargetFromElement(element) } as Surface;
}

describe('appendWebSurface', () => {
  it('anchors the drawable in the given parent', () => {
    const canvas = document.createElement('canvas');
    const parent = document.createElement('div');

    expect(appendWebSurface(surfaceOver(canvas), parent)).toBe(true);
    expect(parent.firstElementChild).toBe(canvas);
  });

  it('leaves an allocated surface unattached until it is called', () => {
    const target = webHostCanvas.create(32, 32)!;
    const surface = { target } as Surface;

    expect(getWebSurfaceElement(surface)!.parentElement).toBeNull();
    appendWebSurface(surface, document.body);
    expect(getWebSurfaceElement(surface)!.parentElement).toBe(document.body);
  });

  it('returns false for a target this host does not own', () => {
    expect(appendWebSurface({ target: {} } as Surface, document.body)).toBe(false);
  });
});

describe('getWebSurfaceCanvas', () => {
  it('returns the canvas backing the surface', () => {
    const canvas = document.createElement('canvas');

    expect(getWebSurfaceCanvas(surfaceOver(canvas))).toBe(canvas);
  });

  it('returns null when the target is not backed by a canvas', () => {
    expect(getWebSurfaceCanvas(surfaceOver(document.createElement('div')))).toBeNull();
  });
});

describe('getWebSurfaceElement', () => {
  it('returns the element the target names', () => {
    const div = document.createElement('div');

    expect(getWebSurfaceElement(surfaceOver(div))).toBe(div);
  });

  it('returns null for a target this host does not own', () => {
    expect(getWebSurfaceElement({ target: {} } as Surface)).toBeNull();
  });
});

describe('setWebSurfaceDisplaySize', () => {
  it('sets the presented size without touching the backing store', () => {
    const target = webHostCanvas.create(1600, 1000)!;
    const surface = { target } as Surface;

    expect(setWebSurfaceDisplaySize(surface, 800, 500)).toBe(true);
    const canvas = getWebSurfaceCanvas(surface)!;
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('500px');
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1000);
  });

  it('returns false for a target this host does not own', () => {
    expect(setWebSurfaceDisplaySize({ target: {} } as Surface, 10, 10)).toBe(false);
  });
});
