import { installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { ColorLut, WgpuColorLutTextureCache, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

import { applyColorLutPassToWgpu } from './wgpuColorLutPass';
import * as wgpuEffectPassModule from './wgpuEffectPass';

const passState = {
  acquireSlot: vi.fn(() => 256),
  beginPass: vi.fn((_dest: unknown, loadOp: string) => {
    recorded.loadOps.push(loadOp);
    return {
      draw: vi.fn((count: number) => recorded.draws.push(count)),
      end: vi.fn(),
      setBindGroup: vi.fn((index: number, group: unknown) => recorded.bindGroups.push({ group, index })),
      setPipeline: vi.fn((pipeline: unknown) => recorded.pipelines.push(pipeline)),
    };
  }),
  sampler: { id: 'sampler' },
  textureBGLayout: { id: 'textureBGLayout' },
  uniformBG: { id: 'uniformBG' },
  uniformBGLayout: { id: 'uniformBGLayout' },
  writeSlot: vi.fn((_offset: number, write: (f32: Float32Array) => void) => {
    const f32 = new Float32Array(4);
    write(f32);
    recorded.uniforms.push([...f32]);
  }),
};
const recorded = {
  bindGroups: [] as { group: unknown; index: number }[],
  draws: [] as number[],
  loadOps: [] as string[],
  pipelines: [] as unknown[],
  shaderCode: [] as string[],
  uniforms: [] as number[][],
};

// The WebGPU flag enums are type-level only in @webgpu/types, so jsdom has no runtime values for the
// usage and visibility bits this module ORs together.
beforeAll(() => installWgpuMock());

beforeEach(() => {
  vi.spyOn(wgpuEffectPassModule, 'getWgpuEffectPassState').mockReturnValue(passState as never);
  // eslint-disable-next-line no-import-assign -- replacing a non-function export for test; works on Vite SSR namespaces
  Object.defineProperty(wgpuEffectPassModule, 'EFFECT_VERTEX_WGSL', { value: 'VERTEX_WGSL\n', configurable: true });
});

afterEach(() => vi.restoreAllMocks());

function createHarness(): {
  createTexture: ReturnType<typeof vi.fn>;
  destroyed: string[];
  state: WgpuRenderState;
  uploads: Uint8Array[];
} {
  const destroyed: string[] = [];
  const uploads: Uint8Array[] = [];
  let nextTexture = 0;
  const createTexture = vi.fn(() => {
    const id = `lut-${nextTexture++}`;
    return { createView: vi.fn(() => ({ id: `${id}-view` })), destroy: () => destroyed.push(id), id };
  });
  const state = {
    device: {
      createBindGroup: vi.fn((descriptor: unknown) => ({ descriptor })),
      createBindGroupLayout: vi.fn(() => ({ id: 'lutBGLayout' })),
      createPipelineLayout: vi.fn(() => ({ id: 'pipelineLayout' })),
      createRenderPipeline: vi.fn((descriptor: { fragment: { targets: { format: string }[] } }) => ({
        format: descriptor.fragment.targets[0]!.format,
      })),
      createShaderModule: vi.fn((descriptor: { code: string }) => {
        recorded.shaderCode.push(descriptor.code);
        return { id: 'module' };
      }),
      createTexture,
      queue: { writeTexture: vi.fn((_destination: unknown, data: Uint8Array) => uploads.push(new Uint8Array(data))) },
    },
  } as unknown as WgpuRenderState;
  return { createTexture, destroyed, state, uploads };
}

function createLut(size: number, samples: ReadonlyArray<number>): ColorLut {
  return { samples: Float32Array.from(samples), size } as unknown as ColorLut;
}

function createGreyLut(size = 2): ColorLut {
  const count = size * size * size;
  const samples: number[] = [];
  for (let index = 0; index < count; index++)
    samples.push(index / (count - 1), index / (count - 1), index / (count - 1));
  return createLut(size, samples);
}

function emptyCache(): WgpuColorLutTextureCache {
  return { lut: null, size: 0, texture: null } as unknown as WgpuColorLutTextureCache;
}

function apply(
  harness: ReturnType<typeof createHarness>,
  lut: Readonly<ColorLut>,
  cache: WgpuColorLutTextureCache,
  format = 'rgba8unorm',
): void {
  const target = { format, view: { id: 'sourceView' } } as unknown as WgpuRenderTarget;
  applyColorLutPassToWgpu(harness.state, target, target, lut, cache);
}

function reset(): void {
  recorded.bindGroups.length = 0;
  recorded.draws.length = 0;
  recorded.loadOps.length = 0;
  recorded.pipelines.length = 0;
  recorded.shaderCode.length = 0;
  recorded.uniforms.length = 0;
}

describe('applyColorLutPassToWgpu', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. It is the SINGLE realization for the whole LUT-tier
  // Adjustment family on this backend — curves, levels, gamma, colour grading all bake to one 3D LUT and
  // arrive here — so an error is wrong colour everywhere at once, and a LUT lookup always returns a
  // colour rather than an error.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases below are CONSTRUCTED, not restored: its
  // history holds the feature commit, a caching perf change, a type move and the lane refactor.
  //
  // ★ SCOPE, STATED SO A PASS IS NOT OVERREAD. The fragment arithmetic — the half-texel cell-centre
  // mapping — is evaluated numerically on the paired Gl file, where a scalar GLSL evaluator exists;
  // effects-wgpu must not depend on effects-gl to borrow it. What this file covers is everything on the
  // CPU side of the seam, which is where this backend carries complexity its sibling does not: an
  // explicit bind-group layout, a pipeline per destination format, and a texture that is recreated rather
  // than merely rewritten when the LUT size changes.
  beforeEach(() => reset());

  it('uploads the LUT with samples scaled to bytes and alpha forced opaque', () => {
    const harness = createHarness();

    apply(
      harness,
      createLut(
        2,
        new Array(24).fill(0).map((_, index) => (index % 3) / 2),
      ),
      emptyCache(),
    );

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

  // ★ CONSTRUCTED CASE: the write is skipped when handed the SAME LUT reference. A static grade is the
  // common case and a 32³ table is 128 KB — re-uploading it every frame is a defect no output comparison
  // could ever see.
  it('writes once for an unchanged LUT and again when it changes', () => {
    const harness = createHarness();
    const cache = emptyCache();
    const lut = createGreyLut();

    apply(harness, lut, cache);
    apply(harness, lut, cache);
    expect(harness.uploads).toHaveLength(1);

    apply(harness, createGreyLut(), cache);
    expect(harness.uploads).toHaveLength(2);
  });

  // ★ CONSTRUCTED CASE: a 3D texture's dimensions are fixed at creation, so a LUT of a different SIZE
  // needs a new texture — rewriting the old one would either fail validation or grade through a table of
  // the wrong extent. The previous texture is destroyed rather than leaked, since this is a real GPU
  // resource and `destroy` is the verb for one.
  // MEASURED by dropping the `cache.size !== n` arm so the texture is only created once — 1 of 9 failed,
  // the predicted one and only it:
  //   AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
  it('recreates and destroys the texture when the LUT size changes, and reuses it when it does not', () => {
    const harness = createHarness();
    const cache = emptyCache();

    apply(harness, createGreyLut(2), cache);
    apply(harness, createGreyLut(2), cache);
    expect(harness.createTexture).toHaveBeenCalledTimes(1);
    expect(harness.destroyed).toEqual([]);

    apply(harness, createGreyLut(4), cache);
    expect(harness.createTexture).toHaveBeenCalledTimes(2);
    expect(harness.destroyed).toEqual(['lut-0']);
  });

  // ★ CONSTRUCTED CASE: a render pipeline's colour target format must match the attachment it draws into,
  // so an HDR (rgba16float) effect target needs its own pipeline. Cached per state alone, the second
  // format would silently reuse the first's pipeline — a validation error at best and a wrong-format
  // draw at worst, and only on the HDR path.
  // MEASURED by looking the pipeline up without the format key — 1 of 9 failed, the predicted one and
  // only it:
  //   AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
  it('builds one pipeline per destination format and reuses it within a format', () => {
    const harness = createHarness();
    const cache = emptyCache();

    apply(harness, createGreyLut(), cache, 'rgba8unorm');
    apply(harness, createGreyLut(), cache, 'rgba8unorm');
    expect(harness.state.device.createRenderPipeline).toHaveBeenCalledTimes(1);

    apply(harness, createGreyLut(), cache, 'rgba16float');
    expect(harness.state.device.createRenderPipeline).toHaveBeenCalledTimes(2);
    expect(recorded.pipelines.at(-1)).toEqual({ format: 'rgba16float' });
  });

  // The group indices are a contract with the WGSL: 0 uniforms, 1 source texture, 2 LUT. Swapped, the
  // pass would sample the scene as its own grade — every draw wrong, in a way that still produces pixels.
  it('binds uniforms, source and LUT to groups zero, one and two', () => {
    const harness = createHarness();

    apply(harness, createGreyLut(), emptyCache());

    expect(recorded.bindGroups.map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(recorded.draws).toEqual([6]);
  });

  // `load` rather than `clear`: this is a full-frame grade over what is already in the target.
  it('loads the destination rather than clearing it', () => {
    const harness = createHarness();

    apply(harness, createGreyLut(), emptyCache());

    expect(recorded.loadOps).toEqual(['load']);
  });

  it('passes the LUT size to the shader as its one uniform', () => {
    const harness = createHarness();

    apply(harness, createGreyLut(4), emptyCache());

    expect(recorded.uniforms[0]![0]).toBe(4);
  });

  // A TEXT check, and named as one: it pins the half-texel form against the numeric assertions made on
  // the Gl sibling. It cannot tell whether the arithmetic is right — only that these two shaders still
  // agree about what to compute, which is the cross-backend claim worth locking here.
  it('computes cell centres from the size uniform, matching the Gl recipe', () => {
    const harness = createHarness();

    apply(harness, createGreyLut(), emptyCache());

    expect(recorded.shaderCode[0]).toContain('(uni.u_size - 1.0) / uni.u_size');
    expect(recorded.shaderCode[0]).toContain('0.5 / uni.u_size');
  });
});
