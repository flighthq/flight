import * as renderGlContract from '@flighthq/render-gl/contract';

import * as glEffectBlitShader from './glEffectBlitShader';
import * as glEffectBoxBlur from './glEffectBoxBlur';
import * as glEffectTintShader from './glEffectTintShader';
import {
  applyOuterGlowEffectToGl,
  defaultGlOuterGlowEffectRunner,
  registerGlOuterGlowEffect,
} from './glOuterGlowEffect';

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

  vi.spyOn(glEffectBlitShader, 'applyGlEffectBlitPass').mockImplementation((() => {}) as never);
  vi.spyOn(glEffectBlitShader, 'applyGlEffectErasePass').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectBoxBlur, 'applyGlEffectBoxBlur').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectTintShader, 'applyGlEffectTintPass').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyOuterGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToGl).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToGl(createState(), source, dest, createPool(), { kind: 'OuterGlowEffect' });

    expect(glEffectBlitShader.applyGlEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(glEffectBlitShader.applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  it('hides the source when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'hide',
    });

    expect(glEffectBlitShader.applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(glEffectBlitShader.applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'knockout',
    });

    expect(glEffectBlitShader.applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(glEffectBlitShader.applyGlEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultGlOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlOuterGlowEffectRunner).toBe('function');
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

describe('registerGlOuterGlowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlOuterGlowEffect).toBeTypeOf('function');
  });
});
