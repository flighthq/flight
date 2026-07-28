import { createImageResource } from '@flighthq/image/contract';
import { createSampler, createTexture } from '@flighthq/texture/contract';

import { createBitmapPattern, createGradientPattern } from './canvasFillPattern';

function makeContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return canvas.getContext('2d') as CanvasRenderingContext2D;
}

function makeTexture(w = 64, h = 64, repeatX = false, repeatY = false, smooth = true) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return createTexture({
    sampler: createSampler({
      magFilter: smooth ? 'linear' : 'nearest',
      minFilter: smooth ? 'linear' : 'nearest',
      mipmaps: false,
      wrapU: repeatX ? 'repeat' : 'clamp-to-edge',
      wrapV: repeatY ? 'repeat' : 'clamp-to-edge',
    }),
    storage: { dimension: '2d', image: createImageResource(canvas) },
  });
}

describe('createBitmapPattern', () => {
  it('returns null when the texture is unbound', () => {
    const context = makeContext();
    expect(createBitmapPattern(context, createTexture())).toBeNull();
  });

  it('returns a CanvasPattern when the texture is drawable', () => {
    const context = makeContext();
    const result = createBitmapPattern(context, makeTexture());
    expect(result).not.toBeNull();
  });

  it('uses repeat when both sampler axes repeat', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createPattern');
    createBitmapPattern(context, makeTexture(64, 64, true, true));
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'repeat');
  });

  it('uses no-repeat when both sampler axes clamp', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createPattern');
    createBitmapPattern(context, makeTexture());
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'no-repeat');
  });

  it('sets imageSmoothingEnabled for a linear sampler', () => {
    const context = makeContext();
    context.imageSmoothingEnabled = false;
    createBitmapPattern(context, makeTexture());
    expect(context.imageSmoothingEnabled).toBe(true);
  });

  it('sets imageSmoothingEnabled false for a nearest sampler', () => {
    const context = makeContext();
    context.imageSmoothingEnabled = true;
    createBitmapPattern(context, makeTexture(64, 64, false, false, false));
    expect(context.imageSmoothingEnabled).toBe(false);
  });
});

describe('createGradientPattern', () => {
  it('returns a CanvasGradient for linear type', () => {
    const context = makeContext();
    const result = createGradientPattern(
      context,
      'linear',
      [0xff0000, 0x0000ff],
      [1, 1],
      [0, 255],
      null,
      'pad',
      'rgb',
      0,
    );
    expect(result).toBeInstanceOf(CanvasGradient);
  });

  it('returns a CanvasGradient for radial type', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createRadialGradient');
    createGradientPattern(context, 'radial', [0xff0000, 0x0000ff], [1, 1], [0, 255], null, 'pad', 'rgb', 0);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls createLinearGradient for linear type with pad spread', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createLinearGradient');
    createGradientPattern(context, 'linear', [0xff0000], [1], [128], null, 'pad', 'rgb', 0);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('uses focal point for radial gradient', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createRadialGradient');
    createGradientPattern(context, 'radial', [0xff0000], [1], [128], null, 'pad', 'rgb', 0.5);
    const [fx] = spy.mock.calls[0];
    expect(fx).not.toBe(0);
  });
});
