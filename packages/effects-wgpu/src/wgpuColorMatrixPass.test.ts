import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

import { applyColorMatrixPassToWgpu } from './wgpuColorMatrixPass';
import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectProgramCacheModule from './wgpuEffectProgramCache';

const uniformState = { uploads: [] as number[][] };

beforeEach(() => {
  vi.spyOn(wgpuEffectPassModule, 'drawWgpuEffectPass').mockImplementation(((
    _state: unknown,
    _source: unknown,
    _dest: unknown,
    _pipeline: unknown,
    setUniforms: (f32: Float32Array) => void,
  ) => {
    const f32 = new Float32Array(20);
    setUniforms(f32);
    uniformState.uploads.push([...f32]);
  }) as never);

  vi.spyOn(wgpuEffectProgramCacheModule, 'getWgpuEffectPipeline').mockImplementation(((
    _state: unknown,
    _key: string,
    _wgsl: string,
    _blend: string,
  ) => ({ pipeline: {} })) as never);
});

afterEach(() => vi.restoreAllMocks());

function packed(matrix: ReadonlyArray<number>): readonly number[] {
  uniformState.uploads.length = 0;
  vi.mocked(wgpuEffectProgramCacheModule.getWgpuEffectPipeline).mockClear();
  const target = {} as unknown as WgpuRenderTarget;
  applyColorMatrixPassToWgpu({} as unknown as WgpuRenderState, target, target, matrix);
  return uniformState.uploads[0]!;
}

describe('applyColorMatrixPassToWgpu', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. It is the SINGLE realization for the whole
  // matrix-tier Adjustment family on this backend — invert, grayscale, sepia, saturation, hue rotate,
  // scale/bias all fuse into one 4×5 matrix and arrive here. A packing error is wrong colour in every one
  // of them, and it produces a plausible colour rather than an error.
  //
  // ★ THIS BACKEND REPACKS AND THE OTHER DOES NOT, WHICH IS THE WHOLE HAZARD. Gl uploads the caller's
  // twenty floats verbatim; WGSL wants four vec4f coefficient ROWS with the bias column moved to a fifth
  // vec4f, so this runner permutes 20 indices by hand. Twenty hand-written assignments is precisely the
  // shape where one transposed pair survives review, and nothing downstream would report it.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases are CONSTRUCTED, not restored: its history
  // holds the feature commit, an API rename, a type move and the lane refactor. Branch-2 shape.
  //
  // MEASURED by swapping the red row's alpha coefficient with its bias (f32[3] <-> f32[16]) — 2 of 6:
  //   AssertionError: expected [ 1, 2, 3, 5, 6, 7, 8, 9, 11, …(11) ] to deeply equal [ 1, 2, 3, 4, 6, 7, 8, 9, 11, …(11) ]
  //   AssertionError: expected 5 to be 4 // Object.is equality
  it('packs the four coefficient rows first and the bias column last', () => {
    // Twenty distinct values, so every slot names exactly one source index and a swap cannot hide.
    const distinct = Array.from({ length: 20 }, (_, index) => index + 1);

    expect(packed(distinct)).toEqual([
      // rows R, G, B, A — the RGBA coefficients of each, with each row's bias skipped
      1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19,
      // the bias column, gathered from indices 4, 9, 14, 19
      5, 10, 15, 20,
    ]);
  });

  // Stated separately from the packing above because it is the claim a reader actually needs: the
  // caller's 4×5 row-major matrix means the same thing on both backends, and only the transport differs.
  it('keeps each row bias with its own row, not with the row after it', () => {
    const distinct = Array.from({ length: 20 }, (_, index) => index + 1);
    const uploaded = packed(distinct);

    // Red's bias is the caller's index 4, and red's alpha coefficient is index 3 — the pair a one-off
    // permutation swaps.
    expect(uploaded[3]).toBe(distinct[3]);
    expect(uploaded[16]).toBe(distinct[4]);
    expect(uploaded[19]).toBe(distinct[19]);
  });

  it('leaves an identity matrix as an identity packing', () => {
    expect(packed(IDENTITY)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });

  // A caller handing over a 4×4 (sixteen entries) is the realistic mistake, and every missing slot must
  // read as zero rather than as `undefined` written into a Float32Array — which would be NaN, and NaN
  // through a colour matrix is a transparent black frame.
  it('zero-fills a matrix shorter than twenty', () => {
    const uploaded = packed([1, 0, 0, 0]);

    expect(uploaded.every(Number.isFinite)).toBe(true);
    expect(uploaded.slice(4)).toEqual(new Array(16).fill(0));
  });

  it('ignores coefficients past the twentieth', () => {
    expect(packed([...IDENTITY, 99, 98])).toEqual(packed(IDENTITY));
  });

  it('compiles one pipeline for every matrix, in replace blend', () => {
    packed(IDENTITY);

    const call = vi.mocked(wgpuEffectProgramCacheModule.getWgpuEffectPipeline).mock.calls[0]!;
    expect(call[1]).toBe('adjustment.colorMatrix');
    expect(call[3]).toBe('replace');
  });
});

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
