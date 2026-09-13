import type { WgpuRenderState, WgpuTextureRenderTarget } from '@flighthq/types/contract';

import {
  applyWgpuEffectBlitOffsetPass,
  applyWgpuEffectBlitPass,
  applyWgpuEffectErasePass,
} from './wgpuEffectBlitShader';
import * as wgpuEffectPassMod from './wgpuEffectPass';

const recorded = {
  draws: [] as { dest: unknown; pipeline: unknown; source: unknown; uniforms: number[] }[],
};

const SOURCE_WIDTH = 64;
const SOURCE_HEIGHT = 32;

beforeEach(() => {
  recorded.draws.length = 0;

  vi.spyOn(wgpuEffectPassMod, 'createWgpuEffectPipeline').mockImplementation(((
    _state: unknown,
    wgsl: string,
    blend?: string,
  ) => ({ blend, wgsl })) as never);
  vi.spyOn(wgpuEffectPassMod, 'drawWgpuEffectPass').mockImplementation(((
    _state: unknown,
    source: unknown,
    dest: unknown,
    pipeline: unknown,
    setUniforms: (f32: Float32Array) => void,
  ) => {
    const f32 = new Float32Array(4);
    setUniforms(f32);
    recorded.draws.push({ dest, pipeline, source, uniforms: [...f32] });
  }) as never);
});

afterEach(() => vi.restoreAllMocks());

function createState(): WgpuRenderState {
  return {} as unknown as WgpuRenderState;
}

function createTarget(id: string): WgpuTextureRenderTarget {
  return { height: SOURCE_HEIGHT, id, width: SOURCE_WIDTH } as unknown as WgpuTextureRenderTarget;
}

function reset(): void {
  recorded.draws.length = 0;
  vi.mocked(wgpuEffectPassMod.createWgpuEffectPipeline).mockClear();
}

function offsetFor(dx: number, dy: number): readonly number[] {
  reset();
  applyWgpuEffectBlitOffsetPass(createState(), createTarget('source'), createTarget('dest'), dx, dy);
  return recorded.draws[0]!.uniforms.slice(0, 2);
}

describe('applyWgpuEffectBlitOffsetPass', () => {
  it('moves the image right for a positive dx, by offsetting the sample left', () => {
    expect(offsetFor(8, 0)[0]).toBeCloseTo(-8 / SOURCE_WIDTH, 10);
  });

  it('moves the image down for a positive dy, by offsetting the sample up', () => {
    expect(offsetFor(0, 8)[1]).toBeCloseTo(-8 / SOURCE_HEIGHT, 10);
  });

  it('negates both axes for a positive offset', () => {
    const [x, y] = offsetFor(8, 8);

    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it('normalises each axis by the source dimension for that axis', () => {
    const [x, y] = offsetFor(16, 16);

    expect(x).toBeCloseTo(-16 / SOURCE_WIDTH, 10);
    expect(y).toBeCloseTo(-16 / SOURCE_HEIGHT, 10);
    expect(Math.abs(x)).not.toBeCloseTo(Math.abs(y), 6);
  });

  it('compiles its pipeline once per state and reuses it', () => {
    reset();
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyWgpuEffectBlitOffsetPass(state, source, dest, 1, 1);
    applyWgpuEffectBlitOffsetPass(state, source, dest, 2, 2);

    expect(wgpuEffectPassMod.createWgpuEffectPipeline).toHaveBeenCalledTimes(1);
  });
});

describe('applyWgpuEffectBlitPass', () => {
  it('draws the source into the destination and writes no offset', () => {
    reset();

    applyWgpuEffectBlitPass(createState(), createTarget('source'), createTarget('dest'));

    expect(recorded.draws).toHaveLength(1);
    expect(recorded.draws[0]!.uniforms).toEqual([0, 0, 0, 0]);
  });

  // ★ CONSTRUCTED CASE: the three passes are three DIFFERENT pipelines. They share a cache shape and a
  // signature, so a copy-paste pointing one at another's cache would blit where it should erase — and
  // silently, because a blit and an erase both draw.
  it('uses a different pipeline from the erase and offset passes', () => {
    reset();
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyWgpuEffectBlitPass(state, source, dest);
    applyWgpuEffectErasePass(state, source, dest);
    applyWgpuEffectBlitOffsetPass(state, source, dest, 1, 1);

    expect(new Set(recorded.draws.map((draw) => draw.pipeline)).size).toBe(3);
    expect(wgpuEffectPassMod.createWgpuEffectPipeline).toHaveBeenCalledTimes(3);
  });
});

describe('applyWgpuEffectErasePass', () => {
  // ★ CONSTRUCTED CASE: on this backend the erase is a BLEND MODE baked into the pipeline, not a call
  // before the draw — the Gl sibling sets `blendFunc` instead. The fragment emits only the source alpha,
  // so without the 'erase' blend the pass runs, draws, and quietly does not erase.
  it('builds its pipeline in the erase blend mode, which is what does the erasing', () => {
    reset();

    applyWgpuEffectErasePass(createState(), createTarget('source'), createTarget('dest'));

    expect(vi.mocked(wgpuEffectPassMod.createWgpuEffectPipeline).mock.calls[0]![2]).toBe('erase');
  });

  it('binds the mask as its source', () => {
    reset();
    const source = createTarget('mask');

    applyWgpuEffectErasePass(createState(), source, createTarget('dest'));

    expect(recorded.draws[0]!.source).toBe(source);
  });
});
