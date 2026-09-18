import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createWebHostCanvas, initializeWebHostCanvas, webHostCanvas } from './webHostCanvas';
import { createWebHostTargetFromElement, getCanvasForTarget, resetWebHostTargetBackendForTest } from './webHostTarget';

afterEach(() => {
  resetWebHostTargetBackendForTest();
});

describe('createWebHostCanvas', () => {
  it('returns an Entity capability', () => {
    expect(EntityRuntimeKey in createWebHostCanvas()).toBe(true);
  });

  it('allocates a canvas target sized in device pixels', () => {
    const target = createWebHostCanvas().create(320, 240);

    expect(target).not.toBeNull();
    const canvas = getCanvasForTarget(target!);
    expect(canvas?.width).toBe(320);
    expect(canvas?.height).toBe(240);
  });

  it('acquires a 2D context on a target it allocated', () => {
    const capability = createWebHostCanvas();
    const target = capability.create(64, 48)!;

    expect(capability.acquire(target)).not.toBeNull();
  });

  it('acquires a 2D context on an adopted canvas', () => {
    const capability = createWebHostCanvas();
    const target = createWebHostTargetFromElement(document.createElement('canvas'));

    expect(capability.acquire(target)).not.toBeNull();
  });

  it('returns null when the target is not backed by a canvas', () => {
    const capability = createWebHostCanvas();
    const target = createWebHostTargetFromElement(document.createElement('div'));

    expect(capability.acquire(target)).toBeNull();
  });
});

describe('initializeWebHostCanvas', () => {
  it('fills the capability operations onto a construction', () => {
    const out = {} as Parameters<typeof initializeWebHostCanvas>[0];
    initializeWebHostCanvas(out);

    expect(typeof out.acquire).toBe('function');
    expect(typeof out.create).toBe('function');
    expect(typeof out.release).toBe('function');
  });
});

describe('webHostCanvas', () => {
  it('is an Entity capability value', () => {
    expect(EntityRuntimeKey in webHostCanvas).toBe(true);
  });

  it('release is a no-op because the DOM owns 2D context lifetime', () => {
    const target = webHostCanvas.create(8, 8)!;

    expect(() => webHostCanvas.release(target)).not.toThrow();
    expect(webHostCanvas.acquire(target)).not.toBeNull();
  });
});
