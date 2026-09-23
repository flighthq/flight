import { createCanvasElement } from './canvasElement';
import { canvasTestHost } from './canvasTestSupport';

describe('createCanvasElement', () => {
  it('sets pixel dimensions equal to logical size with default pixelRatio', () => {
    const surface = createCanvasElement(canvasTestHost, 100, 200);
    expect(surface.context.canvas.width).toBe(100);
    expect(surface.context.canvas.height).toBe(200);
  });

  it('scales pixel dimensions by pixelRatio', () => {
    const surface = createCanvasElement(canvasTestHost, 100, 200, 2);
    expect(surface.context.canvas.width).toBe(200);
    expect(surface.context.canvas.height).toBe(400);
  });

  it('sets CSS style dimensions to the logical size', () => {
    const surface = createCanvasElement(canvasTestHost, 100, 200, 2);
    const canvas = surface.context.canvas as HTMLCanvasElement;
    expect(canvas.style.width).toBe('100px');
    expect(canvas.style.height).toBe('200px');
  });
});
