import type { GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

const renderGlMock = vi.hoisted(() => ({
  compileGlFullscreenProgram: vi.fn((_gl: unknown, source: string) => ({ program: { source }, textures: [] })),
  drawGlFullscreenPass: vi.fn(
    (state: unknown, program: unknown, textures: unknown[], dest: unknown, setUniforms: (gl: unknown) => void) => {
      recorded.draws.push({ dest, program, textures });
      setUniforms((state as { gl: unknown }).gl);
    },
  ),
}));
const recorded = vi.hoisted(() => ({
  blendFuncs: [] as number[][],
  draws: [] as { dest: unknown; program: unknown; textures: unknown[] }[],
  offsets: [] as number[][],
}));

vi.mock('@flighthq/render-gl/contract', () => renderGlMock);

import { applyGlEffectBlitOffsetPass, applyGlEffectBlitPass, applyGlEffectErasePass } from './glEffectBlitShader';

const SOURCE_WIDTH = 64;
const SOURCE_HEIGHT = 32;

function createState(): GlRenderState {
  return {
    gl: {
      ONE: 1,
      ONE_MINUS_SRC_ALPHA: 771,
      ZERO: 0,
      blendFunc: vi.fn((sourceFactor: number, destFactor: number) => {
        recorded.blendFuncs.push([sourceFactor, destFactor]);
      }),
      getUniformLocation: (_program: unknown, name: string) => name,
      uniform2f: vi.fn((_location: unknown, x: number, y: number) => {
        recorded.offsets.push([x, y]);
      }),
    },
  } as unknown as GlRenderState;
}

function createTarget(id: string): GlRenderTarget {
  return {
    height: SOURCE_HEIGHT,
    id,
    texture: { id: `${id}-texture` },
    width: SOURCE_WIDTH,
  } as unknown as GlRenderTarget;
}

function offsetFor(dx: number, dy: number): readonly number[] {
  recorded.offsets.length = 0;
  applyGlEffectBlitOffsetPass(createState(), createTarget('source'), createTarget('dest'), dx, dy);
  return recorded.offsets[0]!;
}

function reset(): void {
  recorded.blendFuncs.length = 0;
  recorded.draws.length = 0;
  recorded.offsets.length = 0;
  renderGlMock.compileGlFullscreenProgram.mockClear();
}

describe('applyGlEffectBlitOffsetPass', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. Every offset composite on this backend goes through
  // this one pass — drop shadow, inner shadow, both bevels, the glows. The offset is where an author's
  // `distance` and `angle` finally become pixels, so a sign error here moves the shadow on EVERY one of
  // them at once, and it still draws a shadow.
  //
  // ★ AND IT IS A VERTICAL-ORIGIN SEAM, THE EXACT CLASS THAT WAS WRONG IN SIX EFFECTS TONIGHT. The two
  // axes are deliberately ASYMMETRIC — `-dx` and `+dy` — and that asymmetry IS the conversion. `dx`/`dy`
  // arrive in screen space (Y down), the shader adds the offset to a BOTTOM-left texcoord, and adding to
  // uv samples further along, which moves the image the other way. So +dx must produce a negative uv.x
  // and +dy a positive uv.y. Written symmetrically — the natural-looking thing — every shadow in the SDK
  // lands above its object instead of below it.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases below are CONSTRUCTED, not restored: its
  // history holds the per-node effect lane, a type move and the packaging refactor. Branch-2 shape.
  //
  // MEASURED by writing the two axes symmetrically (`-dx`, `-dy`) — 4 of 10 failed:
  //   AssertionError: expected -0.25 to be close to 0.25, received difference is 0.5
  //   AssertionError: expected -0.25 to be greater than 0
  //   AssertionError: expected -0.5 to be close to 0.5, received difference is 1
  //   AssertionError: expected [ -0, -0 ] to deeply equal [ -0, +0 ]
  it('moves the image right for a positive dx, by offsetting the sample left', () => {
    expect(offsetFor(8, 0)[0]).toBeCloseTo(-8 / SOURCE_WIDTH, 10);
  });

  // ★ THE ASSERTION THE WHOLE FILE IS FOR. A bottom-left texcoord counts up from the bottom, so sampling
  // at a LARGER uv.y reads content from higher in the image and therefore moves it DOWN — which is what
  // a screen-space +dy means.
  it('moves the image down for a positive dy, by offsetting the sample up', () => {
    expect(offsetFor(0, 8)[1]).toBeCloseTo(8 / SOURCE_HEIGHT, 10);
  });

  // Stated as its own claim because it is the one a symmetric rewrite breaks: the two axes disagree in
  // sign for the same positive input, and a test of either axis alone would pass a shader that negated
  // both or neither.
  it('gives the two axes opposite signs for the same positive offset', () => {
    const [x, y] = offsetFor(8, 8);

    expect(x).toBeLessThan(0);
    expect(y).toBeGreaterThan(0);
  });

  // ★ NORMALISED BY THE SOURCE, not the destination and not a square assumption. The two dimensions
  // differ here on purpose: with width and height equal, dividing by the wrong one is invisible.
  // MEASURED by dividing both axes by `source.width` — 2 of 10 failed:
  //   AssertionError: expected 0.125 to be close to 0.25, received difference is 0.125
  //   AssertionError: expected 0.25 to be close to 0.5, received difference is 0.25
  it('normalises each axis by the source dimension for that axis', () => {
    const [x, y] = offsetFor(16, 16);

    expect(x).toBeCloseTo(-16 / SOURCE_WIDTH, 10);
    expect(y).toBeCloseTo(16 / SOURCE_HEIGHT, 10);
    // Not equal, which is exactly what a single shared divisor would make them.
    expect(Math.abs(x)).not.toBeCloseTo(Math.abs(y), 6);
  });

  it('leaves the image where it is for a zero offset', () => {
    expect(offsetFor(0, 0)).toEqual([-0, 0]);
  });

  it('compiles its program once per context and reuses it', () => {
    reset();
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyGlEffectBlitOffsetPass(state, source, dest, 1, 1);
    applyGlEffectBlitOffsetPass(state, source, dest, 2, 2);

    expect(renderGlMock.compileGlFullscreenProgram).toHaveBeenCalledTimes(1);
  });
});

describe('applyGlEffectBlitPass', () => {
  it('draws the source into the destination with no offset uniform', () => {
    reset();

    applyGlEffectBlitPass(createState(), createTarget('source'), createTarget('dest'));

    expect(recorded.draws).toHaveLength(1);
    expect(recorded.offsets).toEqual([]);
  });

  // ★ CONSTRUCTED CASE: the three passes are three DIFFERENT programs. They share a cache shape and a
  // signature, so a copy-paste that pointed one at another's cache would blit where it should erase —
  // and the erase path's own blend state would still be set, making the result look like a compositing
  // bug rather than a wrong shader.
  it('uses a different program from the erase and offset passes', () => {
    reset();
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyGlEffectBlitPass(state, source, dest);
    applyGlEffectErasePass(state, source, dest);
    applyGlEffectBlitOffsetPass(state, source, dest, 1, 1);

    const programs = recorded.draws.map((draw) => draw.program);
    expect(new Set(programs).size).toBe(3);
    expect(renderGlMock.compileGlFullscreenProgram).toHaveBeenCalledTimes(3);
  });
});

describe('applyGlEffectErasePass', () => {
  // ★ CONSTRUCTED CASE: the erase is the BLEND STATE, not the shader. The fragment emits only the source
  // alpha; ZERO / ONE_MINUS_SRC_ALPHA is what turns that into destination-out. Any other pair leaves a
  // pass that runs, draws, and quietly does not erase.
  // MEASURED by blending with ONE / ONE_MINUS_SRC_ALPHA instead — 1 of 10 failed, the predicted one and
  // only it:
  //   AssertionError: expected [ [ 1, 771 ] ] to deeply equal [ [ +0, 771 ] ]
  it('sets destination-out blending, which is what does the erasing', () => {
    reset();

    applyGlEffectErasePass(createState(), createTarget('source'), createTarget('dest'));

    expect(recorded.blendFuncs).toEqual([[0, 771]]);
  });

  it('binds the mask as its source texture', () => {
    reset();
    const source = createTarget('mask');

    applyGlEffectErasePass(createState(), source, createTarget('dest'));

    expect(recorded.draws[0]!.textures).toEqual([source.texture]);
  });
});
