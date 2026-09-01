import * as renderGlContract from '@flighthq/render-gl/contract';

import {
  applyDropShadowEffectToGl,
  defaultGlDropShadowEffectRunner,
  registerGlDropShadowEffect,
} from './glDropShadowEffect';
import * as glEffectBlitShader from './glEffectBlitShader';
import * as glEffectBoxBlur from './glEffectBoxBlur';
import * as glEffectTintShader from './glEffectTintShader';

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;

  vi.spyOn(renderGlContract, 'acquireGlRenderTarget').mockImplementation(((
    _state: never,
    _pool: never,
    descriptor: never,
    _formatPolicy: never,
  ) => ({ ...(descriptor as Record<string, unknown>), id: `scratch-${nextTargetId++}`, texture: {} })) as never);
  vi.spyOn(renderGlContract, 'clearGlRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'releaseGlRenderTarget').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectBlitShader, 'applyGlEffectBlitOffsetPass').mockImplementation((() => {}) as never);
  vi.spyOn(glEffectBlitShader, 'applyGlEffectBlitPass').mockImplementation((() => {}) as never);
  vi.spyOn(glEffectBlitShader, 'applyGlEffectErasePass').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectBoxBlur, 'applyGlEffectBoxBlur').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectTintShader, 'applyGlEffectTintPass').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyDropShadowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToGl).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToGl(createState(), source, dest, createPool(), { kind: 'DropShadowEffect' });

    expect(glEffectBlitShader.applyGlEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(glEffectBlitShader.applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  it('hands the packed color and the effect alpha to the tint pass without splitting either', () => {
    applyDropShadowEffectToGl(createState(), createTarget('source'), createTarget('dest'), createPool(), {
      alpha: 0.5,
      color: 0x9d55ff80,
      kind: 'DropShadowEffect',
    });

    const call = vi.mocked(glEffectTintShader.applyGlEffectTintPass).mock.calls[0]!;
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

    expect(glEffectBlitShader.applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(glEffectBlitShader.applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'DropShadowEffect',
      sourceMode: 'knockout',
    });

    expect(glEffectBlitShader.applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(glEffectBlitShader.applyGlEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultGlDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDropShadowEffectRunner).toBe('function');
  });
});

describe('registerGlDropShadowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDropShadowEffect).toBeTypeOf('function');
  });
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
