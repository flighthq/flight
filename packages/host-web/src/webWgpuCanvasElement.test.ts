import { createWebWgpuCanvasElement } from './webWgpuCanvasElement';

describe('createWebWgpuCanvasElement', () => {
  it('sizes the backing store in device pixels and the element in CSS pixels', () => {
    // The two are different numbers on a high-DPI display, and a canvas that confuses them renders at
    // the wrong resolution while looking the right size — which is exactly the mistake this removes.
    const canvas = createWebWgpuCanvasElement(320, 240, 2);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(canvas.style.width).toBe('320px');
    expect(canvas.style.height).toBe('240px');
  });

  it('defaults to a pixel ratio of one', () => {
    const canvas = createWebWgpuCanvasElement(100, 50);

    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
  });
});
