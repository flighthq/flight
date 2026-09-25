import { webHostSurfaceDisplay, webHostSurfaceResize } from './webHostSurface.ts';
import { createWebSurfaceFromElement } from './webSurfaceHandle.ts';

describe('webHostSurfaceDisplay', () => {
  it('sets the presented size without touching the backing store', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    webHostSurfaceDisplay.setDisplaySize(createWebSurfaceFromElement(canvas), 800, 500);

    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('500px');
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1000);
  });

  it('is a no-op for a surface whose drawable is not an element', () => {
    expect(() =>
      webHostSurfaceDisplay.setDisplaySize(createWebSurfaceFromElement(7 as unknown as HTMLElement), 10, 10),
    ).not.toThrow();
  });
});

describe('webHostSurfaceResize', () => {
  it('sets the backing store without touching the presented size', () => {
    const canvas = document.createElement('canvas');
    canvas.style.width = '800px';
    webHostSurfaceResize.resize(createWebSurfaceFromElement(canvas), 1600, 1000);

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1000);
    expect(canvas.style.width).toBe('800px');
  });

  it('is a no-op for a surface that is not backed by a canvas', () => {
    expect(() =>
      webHostSurfaceResize.resize(createWebSurfaceFromElement(document.createElement('div')), 10, 10),
    ).not.toThrow();
  });
});
