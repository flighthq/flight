import { invalidateImageResource, unregisterHostImageDimensionResolver } from '@flighthq/image/contract';
import { afterEach } from 'vitest';

import {
  createWebImageResourceFromCanvas,
  createWebImageResourceFromImageBitmap,
  createWebImageResourceFromImageElement,
  initializeWebImageResourceFromCanvas,
  initializeWebImageResourceFromImageBitmap,
  initializeWebImageResourceFromImageElement,
  registerWebImageDimensionResolver,
  webImageDimensionResolver,
} from './webImageResource';

// Every test here starts with no resolver installed: the slot is module state in @flighthq/image, and a
// leaked registration would silently make a later test measure through a host it never asked for.
afterEach(() => {
  unregisterHostImageDimensionResolver();
});

describe('createWebImageResourceFromCanvas', () => {
  it('wraps a canvas with correct dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const resource = createWebImageResourceFromCanvas(canvas);

    expect(resource.source).toBe(canvas);
    expect(resource.width).toBe(320);
    expect(resource.height).toBe(240);
  });

  it('reflects the canvas dimensions at wrap time', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    const resource = createWebImageResourceFromCanvas(canvas);

    expect(resource.width).toBe(0);
    expect(resource.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const canvas = document.createElement('canvas');
    expect(createWebImageResourceFromCanvas(canvas)).not.toBe(createWebImageResourceFromCanvas(canvas));
  });
});

describe('createWebImageResourceFromImageBitmap', () => {
  it('wraps an ImageBitmap with correct dimensions', () => {
    const bitmap = { width: 64, height: 128, close: () => {} } as ImageBitmap;
    const resource = createWebImageResourceFromImageBitmap(bitmap);

    expect(resource.source).toBe(bitmap);
    expect(resource.width).toBe(64);
    expect(resource.height).toBe(128);
  });

  it('returns a new object each call', () => {
    const bitmap = { width: 1, height: 1, close: () => {} } as ImageBitmap;
    expect(createWebImageResourceFromImageBitmap(bitmap)).not.toBe(createWebImageResourceFromImageBitmap(bitmap));
  });
});

describe('createWebImageResourceFromImageElement', () => {
  it('wraps an HTMLImageElement with correct dimensions', () => {
    const img = { width: 200, height: 100 } as HTMLImageElement;
    const resource = createWebImageResourceFromImageElement(img);

    expect(resource.source).toBe(img);
    expect(resource.width).toBe(200);
    expect(resource.height).toBe(100);
  });

  it('reflects zero dimensions for an unloaded image element', () => {
    const img = document.createElement('img');
    const resource = createWebImageResourceFromImageElement(img);

    expect(resource.width).toBe(0);
    expect(resource.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const img = document.createElement('img');
    expect(createWebImageResourceFromImageElement(img)).not.toBe(createWebImageResourceFromImageElement(img));
  });
});

describe('initializeWebImageResourceFromCanvas', () => {
  it('is the construction initializer of createWebImageResourceFromCanvas', () => {
    expect(typeof initializeWebImageResourceFromCanvas).toBe('function');
  });
});

describe('initializeWebImageResourceFromImageBitmap', () => {
  it('is the construction initializer of createWebImageResourceFromImageBitmap', () => {
    expect(typeof initializeWebImageResourceFromImageBitmap).toBe('function');
  });
});

describe('initializeWebImageResourceFromImageElement', () => {
  it('is the construction initializer of createWebImageResourceFromImageElement', () => {
    expect(typeof initializeWebImageResourceFromImageElement).toBe('function');
  });
});

describe('registerWebImageDimensionResolver', () => {
  it('installs the web resolver so image re-reads a live element size', () => {
    registerWebImageDimensionResolver();
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const resource = createWebImageResourceFromCanvas(canvas);
    canvas.width = 16;
    canvas.height = 32;
    invalidateImageResource(resource);

    expect(resource.width).toBe(16);
    expect(resource.height).toBe(32);
  });

  it('leaves the resource untouched once the resolver is taken back out', () => {
    registerWebImageDimensionResolver();
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const resource = createWebImageResourceFromCanvas(canvas);
    unregisterHostImageDimensionResolver();
    canvas.width = 64;
    invalidateImageResource(resource);

    expect(resource.width).toBe(8);
  });
});

describe('webImageDimensionResolver', () => {
  it('reads videoWidth and videoHeight from a video element', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { value: 640 });
    Object.defineProperty(video, 'videoHeight', { value: 360 });
    const out = { height: 0, width: 0 };

    expect(webImageDimensionResolver(video, out)).toBe(true);
    expect(out).toStrictEqual({ height: 360, width: 640 });
  });

  it('reads width and height from every other drawable', () => {
    const bitmap = { width: 12, height: 5, close: () => {} } as ImageBitmap;
    const out = { height: 0, width: 0 };

    expect(webImageDimensionResolver(bitmap, out)).toBe(true);
    expect(out).toStrictEqual({ height: 5, width: 12 });
  });

  // Declining rather than reporting zero is what lets a resource keep the size a producer already
  // measured: a handle this host did not make is not a handle of size 0x0.
  it('declines a handle that carries no numeric size and leaves out alone', () => {
    const out = { height: 7, width: 3 };

    expect(webImageDimensionResolver({} as ImageBitmap, out)).toBe(false);
    expect(out).toStrictEqual({ height: 7, width: 3 });
  });
});
