import type { CanvasRenderTarget } from '@flighthq/types';

import {
  drawCanvasAccumulationPass,
  drawCanvasEffectPass,
  drawCanvasImageDataPass,
  passthroughCanvasEffectPass,
} from './canvasEffectCompositing';

describe('drawCanvasAccumulationPass', () => {
  it('is a function', () => {
    expect(typeof drawCanvasAccumulationPass).toBe('function');
  });
  it('calls perSampleTransform for each sample', () => {
    const dest = makeTarget();
    const source = makeTarget();
    let calls = 0;
    drawCanvasAccumulationPass(dest, source, 3, () => {
      calls++;
    });
    expect(calls).toBe(3);
  });
});

describe('drawCanvasEffectPass', () => {
  it('is a function', () => {
    expect(typeof drawCanvasEffectPass).toBe('function');
  });
});

describe('drawCanvasImageDataPass', () => {
  it('is a function', () => {
    expect(typeof drawCanvasImageDataPass).toBe('function');
  });
  it('calls transform with the pixel buffer', () => {
    const dest = makeTarget(2, 2);
    const source = makeTarget(2, 2);
    // Fill source with a known color.
    source.context.fillStyle = 'rgb(100,150,200)';
    source.context.fillRect(0, 0, 2, 2);
    let called = false;
    drawCanvasImageDataPass(dest, source, (_data, pixelCount) => {
      called = true;
      expect(pixelCount).toBe(4);
    });
    expect(called).toBe(true);
  });
});

describe('passthroughCanvasEffectPass', () => {
  it('is a function', () => {
    expect(typeof passthroughCanvasEffectPass).toBe('function');
  });
});

// Minimal CanvasRenderTarget factory for unit tests.
function makeTarget(w = 4, h = 4): CanvasRenderTarget {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  return { canvas, context, width: w, height: h } as CanvasRenderTarget;
}
