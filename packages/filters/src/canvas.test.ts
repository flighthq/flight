import { describe, expect, it, vi } from 'vitest';

import { applyCanvasCSSFilter } from './canvas';

function makeContext() {
  return {
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('applyCanvasCSSFilter', () => {
  it('sets filter, draws, and restores for a supported filter', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    const result = applyCanvasCSSFilter(ctx, source, 0, 0, { type: 'blur', blurX: 4, blurY: 4 });

    expect(result).toBe(true);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('does not draw and returns false for an unsupported filter', () => {
    const ctx = makeContext();
    const result = applyCanvasCSSFilter(ctx, {} as CanvasImageSource, 0, 0, {
      type: 'convolution',
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    });

    expect(result).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('passes dx and dy to drawImage', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    applyCanvasCSSFilter(ctx, source, 10, 20, { type: 'blur', blurX: 2, blurY: 2 });
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 10, 20);
  });
});
