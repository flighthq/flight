import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

// This file is in REGISTRY_ISOLATED_TESTS because its two top-level mocks replace shared effect-pass
// modules for every table row. The private registry makes the hoisted form file-scoped without rebuilding
// the full effects graph through resetModules plus dynamic imports for each test.
const recorded = vi.hoisted(() => ({ uniforms: [] as number[][] }));
const passMock = vi.hoisted(() => {
  const recordUniforms = (setUniforms: (f32: Float32Array) => void): void => {
    const f32 = new Float32Array(8);
    setUniforms(f32);
    recorded.uniforms.push([...f32]);
  };

  return {
    createWgpuDualSourceEffectPipeline: vi.fn(() => ({})),
    drawWgpuDualSourceEffectPass: vi.fn(
      (
        _state: unknown,
        _firstSource: unknown,
        _secondSource: unknown,
        _dest: unknown,
        _pipeline: unknown,
        setUniforms: (f32: Float32Array) => void,
      ) => recordUniforms(setUniforms),
    ),
    drawWgpuEffectPass: vi.fn(
      (
        _state: unknown,
        _source: unknown,
        _dest: unknown,
        _pipeline: unknown,
        setUniforms: (f32: Float32Array) => void,
      ) => recordUniforms(setUniforms),
    ),
  };
});
const pipelineMock = vi.hoisted(() => ({ getWgpuEffectPipeline: vi.fn(() => ({})) }));

vi.mock('./wgpuEffectPass', () => passMock);
vi.mock('./wgpuEffectProgramCache', () => pipelineMock);

import { applyCrtEffectToWgpu } from './wgpuCrtEffect';
import { applyDirectionalBlurEffectToWgpu } from './wgpuDirectionalBlurEffect';
import { applyDisplacementEffectToWgpu } from './wgpuDisplacementEffect';
import { applyDitherEffectToWgpu } from './wgpuDitherEffect';
import { applyFxaaEffectToWgpu } from './wgpuFxaaEffect';
import { applyGlitchEffectToWgpu } from './wgpuGlitchEffect';
import { applyKuwaharaEffectToWgpu } from './wgpuKuwaharaEffect';
import { applyMotionBlurEffectToWgpu } from './wgpuMotionBlurEffect';
import { applyPixelateEffectToWgpu } from './wgpuPixelateEffect';
import { applySharpenEffectToWgpu } from './wgpuSharpenEffect';
import { applySmaaEffectToWgpu } from './wgpuSmaaEffect';
import { applySsaoEffectToWgpu } from './wgpuSsaoEffect';
import { applyTiltShiftEffectToWgpu } from './wgpuTiltShiftEffect';

type ApplyEffect = (
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
) => void;

const state = { surface: { height: 600, width: 800 } } as unknown as WgpuRenderState;
const nativeTarget = { height: 600, sampleCount: 1, view: {}, width: 800 } as unknown as WgpuRenderTarget;
// Pool scratch targets preserve supersampled dimensions but have sampleCount 1; this is the discriminator
// that prevents a tempting sampleCount-derived implementation from silently returning the wrong scale.
const supersampledScratchTarget = {
  height: 1200,
  sampleCount: 1,
  view: {},
  width: 1600,
} as unknown as WgpuRenderTarget;

const logicalEffects: ReadonlyArray<{
  readonly apply: ApplyEffect;
  readonly name: string;
  readonly resolutionSlot: number;
}> = [
  {
    apply: (renderState, source, dest) =>
      applyTiltShiftEffectToWgpu(renderState, source, dest, { kind: 'TiltShiftEffect' } as never),
    name: 'tilt-shift',
    resolutionSlot: 4,
  },
  {
    apply: (renderState, source, dest) =>
      applyDisplacementEffectToWgpu(renderState, source, dest, { kind: 'DisplacementEffect' } as never),
    name: 'displacement',
    resolutionSlot: 4,
  },
  {
    apply: (renderState, source, dest) =>
      applyDirectionalBlurEffectToWgpu(renderState, source, dest, { kind: 'DirectionalBlurEffect' } as never),
    name: 'directional blur',
    resolutionSlot: 4,
  },
  {
    apply: (renderState, source, dest) =>
      applyKuwaharaEffectToWgpu(renderState, source, dest, { kind: 'KuwaharaEffect' } as never),
    name: 'kuwahara',
    resolutionSlot: 2,
  },
  {
    apply: (renderState, source, dest) =>
      applyGlitchEffectToWgpu(renderState, source, dest, { kind: 'GlitchEffect' } as never),
    name: 'glitch',
    resolutionSlot: 4,
  },
  {
    apply: (renderState, source, dest) =>
      applyMotionBlurEffectToWgpu(
        renderState,
        source,
        dest,
        { createView: () => ({}) } as unknown as GPUTexture,
        { kind: 'MotionBlurEffect' } as never,
      ),
    name: 'active motion blur',
    resolutionSlot: 2,
  },
  {
    apply: (renderState, source, dest) =>
      applySsaoEffectToWgpu(renderState, source, dest, { kind: 'SsaoEffect' } as never),
    name: 'SSAO',
    resolutionSlot: 2,
  },
  {
    apply: (renderState, source, dest) =>
      applyPixelateEffectToWgpu(renderState, source, dest, { kind: 'PixelateEffect' } as never),
    name: 'pixelate',
    resolutionSlot: 2,
  },
  {
    apply: (renderState, source, dest) =>
      applyDitherEffectToWgpu(renderState, source, dest, { kind: 'DitherEffect' } as never),
    name: 'dither',
    resolutionSlot: 2,
  },
  {
    apply: (renderState, source, dest) =>
      applyCrtEffectToWgpu(renderState, source, dest, { kind: 'CrtEffect' } as never),
    name: 'CRT',
    resolutionSlot: 4,
  },
  {
    apply: (renderState, source, dest) =>
      applySharpenEffectToWgpu(renderState, source, dest, { kind: 'SharpenEffect' } as never),
    name: 'sharpen',
    resolutionSlot: 2,
  },
];

const physicalEffects: ReadonlyArray<{ readonly apply: ApplyEffect; readonly name: string }> = [
  {
    apply: (renderState, source, dest) =>
      applyFxaaEffectToWgpu(renderState, source, dest, { kind: 'FxaaEffect' } as never),
    name: 'FXAA',
  },
  {
    apply: (renderState, source, dest) =>
      applySmaaEffectToWgpu(renderState, source, dest, { kind: 'SmaaEffect' } as never),
    name: 'SMAA',
  },
];

function uploadedBy(apply: ApplyEffect, target: WgpuRenderTarget): readonly number[] {
  recorded.uniforms.length = 0;
  apply(state, target, target);
  return recorded.uniforms[0]!;
}

describe('logical effect resolution', () => {
  // MEASURED defeat proof: replacing the dimension-derived scale with 1 made all eleven table rows fail
  // on the scratch target with `expected [1600, 1200] to deeply equal [800, 600]`; both physical rows
  // remained green. This guards the shared unit conversion as well as every approved effect's wiring.
  it.each(logicalEffects)('$name keeps descriptor distances stable across supersampled scratch targets', (effect) => {
    expect(uploadedBy(effect.apply, nativeTarget).slice(effect.resolutionSlot, effect.resolutionSlot + 2)).toEqual([
      800, 600,
    ]);
    expect(
      uploadedBy(effect.apply, supersampledScratchTarget).slice(effect.resolutionSlot, effect.resolutionSlot + 2),
    ).toEqual([800, 600]);
  });

  // FXAA and SMAA are deliberately excluded from logical normalization. Resolved sampleCount 1→4
  // measurements kept their high-frequency energy within 0.31% and shape centroids within 0.03 px,
  // identifying them as physical one-texel raster kernels rather than descriptor-distance effects.
  it.each(physicalEffects)('$name retains physical source resolution', (effect) => {
    expect(uploadedBy(effect.apply, nativeTarget).slice(0, 2)).toEqual([800, 600]);
    expect(uploadedBy(effect.apply, supersampledScratchTarget).slice(0, 2)).toEqual([1600, 1200]);
  });
});
