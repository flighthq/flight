import { createWebCanvasRenderSurfaceCreator, webCanvasRenderSurfaceCreator } from './webCanvasRenderSurface';

describe('createWebCanvasRenderSurfaceCreator', () => {
  it('creates fresh canvases with logical CSS and scaled backing dimensions', () => {
    const creator = createWebCanvasRenderSurfaceCreator();
    const first = creator.createRenderSurface(100, 50, 2)!;
    const second = creator.createRenderSurface(100, 50, 2)!;

    expect(first.style.width).toBe('100px');
    expect(first.style.height).toBe('50px');
    expect(first.width).toBe(200);
    expect(first.height).toBe(100);
    expect(second).not.toBe(first);
  });

  it('collapses a destroyed canvas immediately', () => {
    const creator = createWebCanvasRenderSurfaceCreator();
    const canvas = creator.createRenderSurface(100, 50, 2)!;

    creator.destroyRenderSurface(canvas);

    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});

describe('webCanvasRenderSurfaceCreator', () => {
  it('is a stable singleton', () => {
    expect(webCanvasRenderSurfaceCreator).toBe(webCanvasRenderSurfaceCreator);
  });
});
