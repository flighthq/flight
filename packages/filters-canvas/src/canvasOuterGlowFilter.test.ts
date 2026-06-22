import { vi } from 'vitest';

import { applyOuterGlowFilterToCanvas } from './canvasOuterGlowFilter';

function makeContext() {
  return {
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('applyOuterGlowFilterToCanvas', () => {
  it('returns true and draws for a supported glow', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    const result = applyOuterGlowFilterToCanvas(ctx, source, 5, 5, {
      kind: 'OuterGlowFilter',
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
      kind: 'OuterGlowFilter',
      knockout: true,
    });

    expect(result).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('returns false for anisotropic blur', () => {
    const ctx = makeContext();
    const result = applyOuterGlowFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, {
      kind: 'OuterGlowFilter',
      blurX: 4,
      blurY: 8,
    });

    expect(result).toBe(false);
  });
});
