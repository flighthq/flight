import { vi } from 'vitest';

import { applyDropShadowFilterToCanvas } from './canvasDropShadowFilter';

function makeContext() {
  return {
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('applyDropShadowFilterToCanvas', () => {
  it('returns true and draws for a supported shadow', () => {
    const ctx = makeContext();
    const source = {} as CanvasImageSource;
    const result = applyDropShadowFilterToCanvas(ctx, source, 0, 0, {
      kind: 'DropShadowFilter',
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
      kind: 'DropShadowFilter',
      knockout: true,
    });

    expect(result).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('returns false for anisotropic blur', () => {
    const ctx = makeContext();
    const result = applyDropShadowFilterToCanvas(ctx, {} as CanvasImageSource, 0, 0, {
      kind: 'DropShadowFilter',
      blurX: 2,
      blurY: 8,
    });

    expect(result).toBe(false);
  });
});
