import { createCanvasElement } from './canvasElement';

describe('createCanvasElement', () => {
  it('sets pixel dimensions equal to logical size with default pixelRatio', () => {
    const canvas = createCanvasElement(100, 200);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(200);
  });

  it('scales pixel dimensions by pixelRatio', () => {
    const canvas = createCanvasElement(100, 200, 2);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(400);
  });

  it('sets CSS style dimensions to the logical size', () => {
    const canvas = createCanvasElement(100, 200, 2);
    expect(canvas.style.width).toBe('100px');
    expect(canvas.style.height).toBe('200px');
  });
});
