import { createWebGPUCanvasElement } from './webgpuElement';

describe('createWebGPUCanvasElement', () => {
  it('sets CSS dimensions from width and height', () => {
    const canvas = createWebGPUCanvasElement(400, 300);
    expect(canvas.style.width).toBe('400px');
    expect(canvas.style.height).toBe('300px');
  });

  it('scales pixel dimensions by pixelRatio', () => {
    const canvas = createWebGPUCanvasElement(200, 100, 2);
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
  });

  it('defaults pixelRatio to 1', () => {
    const canvas = createWebGPUCanvasElement(300, 200);
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(200);
  });
});
