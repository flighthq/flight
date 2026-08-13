vi.hoisted(() => {
  vi.resetModules();
});

vi.mock('@flighthq/render-gl/contract', () => {
  let nextTargetId = 0;
  return {
    acquireGlRenderTarget: vi.fn((_state, _pool, descriptor) => ({
      ...descriptor,
      id: `scratch-${nextTargetId++}`,
      texture: {},
    })),
    clearGlRenderTarget: vi.fn(),
    releaseGlRenderTarget: vi.fn(),
  };
});

vi.mock('./glEffectBlitShader', () => ({
  applyGlEffectBlitOffsetPass: vi.fn(),
  applyGlEffectBlitPass: vi.fn(),
  applyGlEffectErasePass: vi.fn(),
}));

vi.mock('./glEffectBoxBlur', () => ({
  applyGlEffectBoxBlur: vi.fn(),
}));

vi.mock('./glEffectTintShader', () => ({
  applyGlEffectTintPass: vi.fn(),
}));

import {
  applyDropShadowEffectToGl,
  defaultGlDropShadowEffectRunner,
  registerGlDropShadowEffect,
} from './glDropShadowEffect';
import { applyGlEffectBlitPass, applyGlEffectErasePass } from './glEffectBlitShader';
import { applyGlEffectTintPass } from './glEffectTintShader';

describe('applyDropShadowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToGl).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToGl(createState(), source, dest, createPool(), { kind: 'DropShadowEffect' });

    expect(applyGlEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  // Piece 3 landed this as a split at the call site, because the tint pass still spoke 24-bit RGB and was
  // shared with effects that had not migrated. Now that every one of them carries packed RGBA, the pass
  // itself folds the color's alpha and the call site hands the value over untouched — one decode point
  // instead of five, and this assertion is what pins which of the two contracts is live.
  it('hands the packed color and the effect alpha to the tint pass without splitting either', () => {
    vi.mocked(applyGlEffectTintPass).mockClear();

    applyDropShadowEffectToGl(createState(), createTarget('source'), createTarget('dest'), createPool(), {
      alpha: 0.5,
      color: 0x9d55ff80,
      kind: 'DropShadowEffect',
    });

    const call = vi.mocked(applyGlEffectTintPass).mock.calls[0]!;
    expect(call[3]).toBe(0x9d55ff80);
    expect(call[4]).toBeCloseTo(0.5, 5);
  });

  it('hides the source when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'DropShadowEffect',
      sourceMode: 'hide',
    });

    expect(applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'DropShadowEffect',
      sourceMode: 'knockout',
    });

    expect(applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyGlEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultGlDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDropShadowEffectRunner).toBe('function');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createState(): never {
  return { gl: {} } as never;
}

function createPool(): never {
  return { free: [] } as never;
}

function createTarget(id: string): never {
  return { id, width: 32, height: 16, format: 'rgba8', texture: {} } as never;
}

describe('registerGlDropShadowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDropShadowEffect).toBeTypeOf('function');
  });
});
