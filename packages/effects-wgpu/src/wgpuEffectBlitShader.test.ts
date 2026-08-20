import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

const passMock = vi.hoisted(() => ({
  createWgpuEffectPipeline: vi.fn((_state: unknown, wgsl: string, blend?: string) => ({ blend, wgsl })),
  drawWgpuEffectPass: vi.fn(
    (_state: unknown, source: unknown, dest: unknown, pipeline: unknown, setUniforms: (f32: Float32Array) => void) => {
      const f32 = new Float32Array(4);
      setUniforms(f32);
      recorded.draws.push({ dest, pipeline, source, uniforms: [...f32] });
    },
  ),
}));
const recorded = vi.hoisted(() => ({
  draws: [] as { dest: unknown; pipeline: unknown; source: unknown; uniforms: number[] }[],
}));

vi.mock('./wgpuEffectPass', () => passMock);

import {
  applyWgpuEffectBlitOffsetPass,
  applyWgpuEffectBlitPass,
  applyWgpuEffectErasePass,
} from './wgpuEffectBlitShader';

const SOURCE_WIDTH = 64;
const SOURCE_HEIGHT = 32;

function createState(): WgpuRenderState {
  return {} as unknown as WgpuRenderState;
}

function createTarget(id: string): WgpuRenderTarget {
  return { height: SOURCE_HEIGHT, id, width: SOURCE_WIDTH } as unknown as WgpuRenderTarget;
}

function reset(): void {
  recorded.draws.length = 0;
  passMock.createWgpuEffectPipeline.mockClear();
}

function offsetFor(dx: number, dy: number): readonly number[] {
  reset();
  applyWgpuEffectBlitOffsetPass(createState(), createTarget('source'), createTarget('dest'), dx, dy);
  return recorded.draws[0]!.uniforms.slice(0, 2);
}

describe('applyWgpuEffectBlitOffsetPass', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. Every offset composite on this backend goes through
  // this one pass — drop shadow, inner shadow, both bevels, the glows. The offset is where an author's
  // `distance` and `angle` finally become pixels, so a sign error moves the shadow on EVERY one of them
  // at once, and it still draws a shadow.
  //
  // ★ THIS ONE IS BRANCH 1: THE DEFECT IS IN GIT AND STILL RESTORABLE. The Y offset used to be NEGATED
  // here relative to the Gl path, on the reasonable-sounding argument that Wgpu's uv y=0 is the top while
  // Gl's is the bottom. It is the wrong conclusion: Wgpu render-target textures are ALSO stored top-down,
  // so the two inversions cancel and the offset must match Gl exactly. With the extra negation the shadow
  // landed up-left instead of down-right on every offset composite. Fixed in 915040009 (then
  // filters-wgpu/src/wgpuBlitShader.ts), and until now the only thing standing behind it was one parity
  // scene and a paragraph of prose.
  //
  // MEASURED by restoring 915040009^'s exact line `f32[1] = -dy / source.height;` — 3 of 9 failed:
  //   AssertionError: expected -0.25 to be close to 0.25, received difference is 0.5
  //   AssertionError: expected -0.25 to be greater than 0
  //   AssertionError: expected -0.5 to be close to 0.5, received difference is 1
  it('moves the image right for a positive dx, by offsetting the sample left', () => {
    expect(offsetFor(8, 0)[0]).toBeCloseTo(-8 / SOURCE_WIDTH, 10);
  });

  // ★ THE ASSERTION THE WHOLE FILE IS FOR, and the one the restored line breaks.
  it('moves the image down for a positive dy, matching the Gl path exactly', () => {
    expect(offsetFor(0, 8)[1]).toBeCloseTo(8 / SOURCE_HEIGHT, 10);
  });

  // Stated as its own claim because the two axes disagree in sign for the same positive input: a test of
  // either axis alone would pass a version that negated both or neither.
  it('gives the two axes opposite signs for the same positive offset', () => {
    const [x, y] = offsetFor(8, 8);

    expect(x).toBeLessThan(0);
    expect(y).toBeGreaterThan(0);
  });

  // Normalised by the SOURCE, per axis. Width and height differ here on purpose: with them equal,
  // dividing by the wrong one is invisible.
  it('normalises each axis by the source dimension for that axis', () => {
    const [x, y] = offsetFor(16, 16);

    expect(x).toBeCloseTo(-16 / SOURCE_WIDTH, 10);
    expect(y).toBeCloseTo(16 / SOURCE_HEIGHT, 10);
    expect(Math.abs(x)).not.toBeCloseTo(Math.abs(y), 6);
  });

  it('compiles its pipeline once per state and reuses it', () => {
    reset();
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyWgpuEffectBlitOffsetPass(state, source, dest, 1, 1);
    applyWgpuEffectBlitOffsetPass(state, source, dest, 2, 2);

    expect(passMock.createWgpuEffectPipeline).toHaveBeenCalledTimes(1);
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
    expect(passMock.createWgpuEffectPipeline).toHaveBeenCalledTimes(3);
  });
});

describe('applyWgpuEffectErasePass', () => {
  // ★ CONSTRUCTED CASE: on this backend the erase is a BLEND MODE baked into the pipeline, not a call
  // before the draw — the Gl sibling sets `blendFunc` instead. The fragment emits only the source alpha,
  // so without the 'erase' blend the pass runs, draws, and quietly does not erase.
  it('builds its pipeline in the erase blend mode, which is what does the erasing', () => {
    reset();

    applyWgpuEffectErasePass(createState(), createTarget('source'), createTarget('dest'));

    expect(passMock.createWgpuEffectPipeline.mock.calls[0]![2]).toBe('erase');
  });

  it('binds the mask as its source', () => {
    reset();
    const source = createTarget('mask');

    applyWgpuEffectErasePass(createState(), source, createTarget('dest'));

    expect(recorded.draws[0]!.source).toBe(source);
  });
});
