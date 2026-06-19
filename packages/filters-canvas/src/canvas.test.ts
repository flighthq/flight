import { vi } from 'vitest';

import { applyBlurFilterToCanvas, applyDropShadowFilterToCanvas, applyOuterGlowFilterToCanvas } from './canvas';

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
    const result = applyBlurFilterToCanvas(ctx, source, 0, 0, { type: 'blur', blurX: 4, blurY: 4 });

    expect(result).toBe(true);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('returns false and does not draw for anisotropic blur', () => {
    const ctx = makeContext();
    const result = applyBlurFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, { type: 'blur', blurX: 4, blurY: 8 });

    expect(result).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('passes dx and dy to drawImage', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    applyBlurFilterToCanvas(ctx, source, 10, 20, { type: 'blur', blurX: 2, blurY: 2 });
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 10, 20);
  });
});

describe('applyDropShadowFilterToCanvas', () => {
  it('returns true and draws for a supported shadow', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    const result = applyDropShadowFilterToCanvas(ctx, source, 0, 0, {
      type: 'dropShadow',
      angle: 45,
      distance: 4,
      blurX: 2,
      blurY: 2,
    });

    expect(result).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
  });

  it('returns false for knockout shadow', () => {
    const ctx = makeContext();
    const result = applyDropShadowFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, {
      type: 'dropShadow',
      knockout: true,
    });

    expect(result).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('returns false for anisotropic blur', () => {
    const ctx = makeContext();
    const result = applyDropShadowFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, {
      type: 'dropShadow',
      blurX: 2,
      blurY: 8,
    });

    expect(result).toBe(false);
  });
});

describe('applyOuterGlowFilterToCanvas', () => {
  it('returns true and draws for a supported glow', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    const result = applyOuterGlowFilterToCanvas(ctx, source, 5, 5, {
      type: 'outerGlow',
      blurX: 6,
      blurY: 6,
      color: 0xff0000,
    });

    expect(result).toBe(true);
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 5, 5);
  });

  it('returns false for knockout glow', () => {
    const ctx = makeContext();
    const result = applyOuterGlowFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, {
      type: 'outerGlow',
      knockout: true,
    });

    expect(result).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('returns false for anisotropic blur', () => {
    const ctx = makeContext();
    const result = applyOuterGlowFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, {
      type: 'outerGlow',
      blurX: 4,
      blurY: 8,
    });

    expect(result).toBe(false);
  });
});
