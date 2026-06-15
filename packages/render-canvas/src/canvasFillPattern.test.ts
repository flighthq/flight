import { createBitmapPattern, createGradientPattern } from './canvasFillPattern';

function makeContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return canvas.getContext('2d') as CanvasRenderingContext2D;
}

function makeBitmap(w = 64, h = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { src: canvas as CanvasImageSource, width: w, height: h };
}

describe('createBitmapPattern', () => {
  it('returns null when bitmap.src is null', () => {
    const context = makeContext();
    expect(createBitmapPattern(context, { src: null, width: 64, height: 64 } as never, true)).toBeNull();
  });

  it('returns a CanvasPattern when src is valid', () => {
    const context = makeContext();
    const result = createBitmapPattern(context, makeBitmap() as never, true);
    expect(result).not.toBeNull();
  });

  it('uses repeat repetition when repeat is true', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createPattern');
    createBitmapPattern(context, makeBitmap() as never, true);
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'repeat');
  });

  it('uses no-repeat when repeat is false', () => {
    const context = makeContext();
    const spy = vi.spyOn(context, 'createPattern');
    createBitmapPattern(context, makeBitmap() as never, false);
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'no-repeat');
  });

  it('sets imageSmoothingEnabled to true when smooth is true', () => {
    const context = makeContext();
    context.imageSmoothingEnabled = false;
    createBitmapPattern(context, makeBitmap() as never, true, true);
    expect(context.imageSmoothingEnabled).toBe(true);
  });

  it('sets imageSmoothingEnabled to false when smooth is false', () => {
    const context = makeContext();
    context.imageSmoothingEnabled = true;
    createBitmapPattern(context, makeBitmap() as never, true, false);
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
