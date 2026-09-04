import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget } from '@flighthq/types/contract';

import { applyColorMatrixPassToCanvas, applyColorMatrixToImageDataBytes } from './canvasColorMatrixPass';

// Minimal stand-ins for the two canvas contexts drawCanvasImageDataPass touches. Using plain objects
// rather than substituting the compositing module keeps the wiring assertion independent of module
// load order, which matters because the suite runs non-isolated (one module registry per worker).
function createStubTargets(pixels: ReadonlyArray<number>): {
  dest: CanvasRenderTarget;
  written: { data: Uint8ClampedArray | null };
  source: CanvasRenderTarget;
} {
  const imageData = { data: new Uint8ClampedArray(pixels) };
  const written: { data: Uint8ClampedArray | null } = { data: null };
  const source = (() => {
    const out = allocateEntity<any>();
    out.context = { getImageData: () => imageData };
    out.height = 1;
    out.width = pixels.length / 4;
    return finishEntity(out) as CanvasRenderTarget;
  })();
  const dest = (() => {
    const out = allocateEntity<any>();
    out.context = {
      clearRect: () => {},
      filter: 'none',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      putImageData: (written_: { data: Uint8ClampedArray }) => {
        written.data = written_.data;
      },
      restore: () => {},
      save: () => {},
      setTransform: () => {},
    };
    out.height = 1;
    out.width = pixels.length / 4;
    return finishEntity(out) as CanvasRenderTarget;
  })();
  return { dest, source, written };
}

const BIAS_MATRIX = [1, 0, 0, 0, 0.5, 0, 1, 0, 0, 0.25, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

describe('applyColorMatrixPassToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyColorMatrixPassToCanvas).toBe('function');
  });

  it('reads the source pixels, applies the matrix, and writes the result to the destination', () => {
    const { dest, source, written } = createStubTargets([0, 0, 0, 255]);
    applyColorMatrixPassToCanvas(source, dest, BIAS_MATRIX);
    expect(written.data).not.toBeNull();
    expect(Array.from(written.data!)).toEqual([128, 64, 0, 255]);
  });
});

describe('applyColorMatrixToImageDataBytes', () => {
  it('converts normalized-linear matrix bias to the ImageData byte domain', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    applyColorMatrixToImageDataBytes(data, 1, BIAS_MATRIX);
    expect(Array.from(data)).toEqual([128, 64, 0, 255]);
  });

  it('applies the matrix to every pixel in the run', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
    applyColorMatrixToImageDataBytes(data, 2, BIAS_MATRIX);
    expect(Array.from(data)).toEqual([128, 64, 0, 255, 128, 64, 0, 255]);
  });

  it('treats absent matrix entries as zero', () => {
    const data = new Uint8ClampedArray([200, 200, 200, 255]);
    applyColorMatrixToImageDataBytes(data, 1, []);
    expect(Array.from(data)).toEqual([0, 0, 0, 0]);
  });
});
