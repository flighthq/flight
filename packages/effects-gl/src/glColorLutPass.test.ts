import type { ColorLut, GlColorLutTextureCache, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

const programMock = vi.hoisted(() => ({
  getGlEffectProgram: vi.fn((_state: unknown, _key: string, _source: string) => ({ program: {} })),
}));

vi.mock('./glEffectProgramCache', () => programMock);

vi.mock('@flighthq/render-gl/contract', () => ({
  drawGlFullscreenPass: vi.fn((state, _program, _textures, _dest, setUniforms) => {
    setUniforms((state as { gl: unknown }).gl, { program: {} });
  }),
}));

import { applyColorLutPassToGl } from './glColorLutPass';
import { evaluateGlslScalarExpression, extractGlslExpression } from './glShaderTestHelper';

// Records the LUT bytes, the sampler parameters, and the texture-unit traffic — a lookup table is its
// contents, how it is filtered, AND which unit it ends up bound to.
function createHarness(): {
  activeUnits: number[];
  bindings: { target: number; texture: unknown }[];
  gl: WebGL2RenderingContext;
  parameters: Map<number, number>;
  samplerUniforms: Map<string, number>;
  state: GlRenderState;
  uploads: Uint8Array[];
} {
  const activeUnits: number[] = [];
  const bindings: { target: number; texture: unknown }[] = [];
  const parameters = new Map<number, number>();
  const samplerUniforms = new Map<string, number>();
  const uploads: Uint8Array[] = [];
  let next = 0;
  const gl = {
    CLAMP_TO_EDGE: 33071,
    LINEAR: 9729,
    RGBA: 6408,
    RGBA8: 32856,
    TEXTURE0: 33984,
    TEXTURE1: 33985,
    TEXTURE_3D: 32879,
    TEXTURE_MAG_FILTER: 10241,
    TEXTURE_MIN_FILTER: 10240,
    TEXTURE_WRAP_R: 32882,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    UNSIGNED_BYTE: 5121,
    activeTexture: vi.fn((unit: number) => {
      activeUnits.push(unit);
    }),
    bindTexture: vi.fn((target: number, texture: unknown) => {
      bindings.push({ target, texture });
    }),
    createTexture: vi.fn(() => ({ id: `lut-${next++}` })),
    getUniformLocation: (_program: unknown, name: string) => name,
    texImage3D: vi.fn(
      (
        _target: number,
        _level: number,
        _internal: number,
        _width: number,
        _height: number,
        _depth: number,
        _border: number,
        _format: number,
        _type: number,
        data: Uint8Array,
      ) => {
        uploads.push(new Uint8Array(data));
      },
    ),
    texParameteri: vi.fn((_target: number, name: number, value: number) => {
      parameters.set(name, value);
    }),
    uniform1f: vi.fn(),
    uniform1i: vi.fn((name: unknown, value: number) => {
      samplerUniforms.set(name as string, value);
    }),
  } as unknown as WebGL2RenderingContext;
  return {
    activeUnits,
    bindings,
    gl,
    parameters,
    samplerUniforms,
    state: { gl } as unknown as GlRenderState,
    uploads,
  };
}

function createLut(size: number, samples: ReadonlyArray<number>): ColorLut {
  return { samples: Float32Array.from(samples), size } as unknown as ColorLut;
}

// A 2×2×2 LUT of eight distinct greys, enough to see ordering and scaling without a wall of numbers.
function createIdentityLut(): ColorLut {
  const samples: number[] = [];
  for (let index = 0; index < 8; index++) samples.push(index / 7, index / 7, index / 7);
  return createLut(2, samples);
}

function emptyCache(): GlColorLutTextureCache {
  return { lut: null, texture: null } as unknown as GlColorLutTextureCache;
}

function apply(
  harness: ReturnType<typeof createHarness>,
  lut: Readonly<ColorLut>,
  cache: GlColorLutTextureCache,
): void {
  const target = { height: 8, texture: {}, width: 8 } as unknown as GlRenderTarget;
  applyColorLutPassToGl(harness.state, target, target, lut, cache);
}

function shaderSource(): string {
  programMock.getGlEffectProgram.mockClear();
  const harness = createHarness();
  apply(harness, createIdentityLut(), emptyCache());
  return programMock.getGlEffectProgram.mock.calls[0]![2] as string;
}

// The shipped half-texel mapping, evaluated for one channel at a given input level. `scale` and `offset`
// are read out of the shader too rather than restated here — restating them would compare the shader
// against a copy of itself and pass however either was written.
function lutCoordinateAt(colour: number, size: number): number {
  const source = shaderSource();
  const scale = evaluateGlslScalarExpression(extractGlslExpression(source, /float scale = ([^;]+);/), {
    u_lutSize: size,
  });
  const offset = evaluateGlslScalarExpression(extractGlslExpression(source, /float offset = ([^;]+);/), {
    u_lutSize: size,
  });
  return evaluateGlslScalarExpression(extractGlslExpression(source, /vec3 lc = ([^;]+);/), {
    'clamp(c.rgb, 0.0, 1.0)': colour,
    offset,
    scale,
  });
}

describe('applyColorLutPassToGl', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. It is the SINGLE realization for the whole LUT-tier
  // Adjustment family: any run of pointwise adjustments containing a nonlinear member bakes to one 3D
  // LUT and arrives here. Curves, levels, gamma, colour grading — all of them are this pass, so an error
  // here is wrong colour everywhere at once, and a LUT lookup always returns a colour.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases below are CONSTRUCTED, not restored: its
  // history holds the feature commit, a caching perf change and the lane refactor. Branch-2 shape.

  // ★ CONSTRUCTED CASE, AND THE ONE MOST WORTH HAVING. A 3D LUT is sampled with hardware trilinear
  // filtering, so the [0,1] colour has to land on CELL CENTRES, not on the texture's edges: scale by
  // (n-1)/n and offset by half a texel. Sampled at the edges instead, every colour is pulled half a cell
  // toward the middle of the LUT — a slight, uniform, entirely plausible colour shift with no edge case
  // and nothing to catch it.
  // MEASURED by sampling edge-to-edge instead (scale 1.0, offset 0.0) — 1 of 8 failed, the endpoints
  // test and only it. The affine test still passes, correctly: an edge-to-edge mapping is still affine,
  // which is exactly why the ENDPOINTS are the claim that separates the two.
  //   AssertionError: expected +0 to be close to 0.0625, received difference is 0.0625
  it('maps black to the first cell centre and white to the last', () => {
    expect(lutCoordinateAt(0, 8)).toBeCloseTo(0.5 / 8, 10);
    expect(lutCoordinateAt(1, 8)).toBeCloseTo(7.5 / 8, 10);
  });

  it('keeps the mapping affine between the two ends', () => {
    // Mid grey lands exactly halfway between the first and last cell centre, at any LUT size.
    expect(lutCoordinateAt(0.5, 8)).toBeCloseTo((0.5 / 8 + 7.5 / 8) / 2, 10);
    expect(lutCoordinateAt(0.5, 32)).toBeCloseTo((0.5 / 32 + 31.5 / 32) / 2, 10);
  });

  it('uploads the LUT as RGBA8 with samples scaled to bytes and alpha forced opaque', () => {
    const harness = createHarness();

    apply(
      harness,
      createLut(
        2,
        new Array(24).fill(0).map((_, index) => (index % 3) / 2),
      ),
      emptyCache(),
    );

    // 0, 0.5, 1 repeating across RGB; every alpha byte is 255 because the LUT carries no alpha.
    expect([...harness.uploads[0]!.slice(0, 8)]).toEqual([0, 128, 255, 255, 0, 128, 255, 255]);
  });

  it('clamps a sample outside zero to one rather than wrapping it', () => {
    const harness = createHarness();
    const samples = new Array(24).fill(0);
    samples[0] = -0.5;
    samples[1] = 1.5;

    apply(harness, createLut(2, samples), emptyCache());

    expect([...harness.uploads[0]!.slice(0, 2)]).toEqual([0, 255]);
  });

  // ★ CONSTRUCTED CASE: the cache skips the upload when handed the SAME LUT reference. A static grade is
  // the common case, and re-uploading a 32³ table every frame is 128 KB of bus traffic per frame for no
  // change — a performance defect no output comparison could ever see.
  // MEASURED by removing the `cache.lut === lut` early return — 1 of 8 failed:
  //   AssertionError: expected [ …(2) ] to have a length of 1 but got 2
  it('uploads once for an unchanged LUT and re-uploads when it changes', () => {
    const harness = createHarness();
    const cache = emptyCache();
    const lut = createIdentityLut();

    apply(harness, lut, cache);
    apply(harness, lut, cache);
    expect(harness.uploads).toHaveLength(1);

    apply(harness, createIdentityLut(), cache);
    expect(harness.uploads).toHaveLength(2);
  });

  it('reuses the cache one texture across LUT changes instead of leaking a new one', () => {
    const harness = createHarness();
    const cache = emptyCache();

    apply(harness, createIdentityLut(), cache);
    apply(harness, createIdentityLut(), cache);

    expect(harness.gl.createTexture).toHaveBeenCalledTimes(1);
  });

  // ★ CONSTRUCTED CASE: CLAMP_TO_EDGE on ALL THREE axes. R is the one that gets forgotten, and under
  // REPEAT the blue axis wraps — the brightest blues fold back to the darkest, which reads as a hue
  // artefact in highlights rather than as a broken sampler.
  // MEASURED by dropping the TEXTURE_WRAP_R line — 1 of 8 failed, the predicted one and only it:
  //   AssertionError: expected undefined to be 33071 // Object.is equality
  it('filters the LUT linearly and clamps on all three axes', () => {
    const harness = createHarness();

    apply(harness, createIdentityLut(), emptyCache());

    expect(harness.parameters.get(harness.gl.TEXTURE_MIN_FILTER)).toBe(harness.gl.LINEAR);
    expect(harness.parameters.get(harness.gl.TEXTURE_MAG_FILTER)).toBe(harness.gl.LINEAR);
    expect(harness.parameters.get(harness.gl.TEXTURE_WRAP_S)).toBe(harness.gl.CLAMP_TO_EDGE);
    expect(harness.parameters.get(harness.gl.TEXTURE_WRAP_T)).toBe(harness.gl.CLAMP_TO_EDGE);
    expect(harness.parameters.get(harness.gl.TEXTURE_WRAP_R)).toBe(harness.gl.CLAMP_TO_EDGE);
  });

  // ★ CONSTRUCTED CASE: the LUT goes on unit 1 and the active unit is put BACK to 0. Leaving unit 1
  // selected is a defect in whatever draws next, not in this pass — the failure lands somewhere else
  // entirely, which is what makes it worth pinning here.
  // MEASURED by removing the `glc.activeTexture(glc.TEXTURE0)` restore — 1 of 8 failed:
  //   AssertionError: expected [ 33985 ] to deeply equal [ 33985, 33984 ]
  it('binds the LUT to unit one and restores unit zero before returning', () => {
    const harness = createHarness();

    apply(harness, createIdentityLut(), emptyCache());

    expect(harness.samplerUniforms.get('u_lut')).toBe(1);
    expect(harness.activeUnits).toEqual([harness.gl.TEXTURE1, harness.gl.TEXTURE0]);
  });
});
