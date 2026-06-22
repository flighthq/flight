import { vi } from 'vitest';

import { applyBlurFilterToCanvas } from './canvasBlurFilter';

function makeContext() {
  return {
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('applyBlurFilterToCanvas', () => {
  it('sets filter, draws, and restores for an isotropic blur', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    const result = applyBlurFilterToCanvas(ctx, source, 0, 0, { kind: 'BlurFilter', blurX: 4, blurY: 4 });

    expect(result).toBe(true);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('returns false and does not draw for anisotropic blur', () => {
    const ctx = makeContext();
    const result = applyBlurFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, {
      kind: 'BlurFilter',
      blurX: 4,
      blurY: 8,
    });

    expect(result).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('passes dx and dy to drawImage', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    applyBlurFilterToCanvas(ctx, source, 10, 20, { kind: 'BlurFilter', blurX: 2, blurY: 2 });
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 10, 20);
  });
});
