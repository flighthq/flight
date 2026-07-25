import type {
  CompositeEffect,
  CompositeOperator,
  WgpuDualSourceEffectPipeline,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';
import { CompositeOperator as CompositeOperatorValues } from '@flighthq/types';

import { getWgpuBlendEffectBackdrop } from './wgpuBlendEffect';
import { createWgpuDualSourceEffectPipeline, drawWgpuDualSourceEffectPass } from './wgpuEffectPass';

// Porter-Duff coverage composite over the same named backdrop registry as BlendEffect. Both inputs are
// premultiplied, so one Fa/Fb pair applies to RGB and alpha exactly as compositeOperatorMath specifies.
export function applyCompositeEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<CompositeEffect>,
): void {
  const backdrop = getWgpuBlendEffectBackdrop(state, effect.backdropKey ?? null);
  const hasBackdrop = backdrop !== null;
  drawWgpuDualSourceEffectPass(
    state,
    source as WgpuRenderTarget,
    (backdrop ?? source) as WgpuRenderTarget,
    dest as WgpuRenderTarget,
    getWgpuCompositeEffectPipeline(state),
    (_f32, i32) => {
      i32[0] = getWgpuCompositeEffectOperatorIndex(effect.operator);
      i32[1] = hasBackdrop ? 1 : 0;
    },
  );
}

export const defaultWgpuCompositeEffectRunner: WgpuRenderEffectRunner = (context, effect) => {
  applyCompositeEffectToWgpu(context.state, context.source, context.dest, effect as CompositeEffect);
};

export function getWgpuCompositeEffectOperatorIndex(operator: CompositeOperator): number {
  return COMPOSITE_OPERATOR_INDEX[operator] ?? 0;
}

function getWgpuCompositeEffectPipeline(state: WgpuRenderState): WgpuDualSourceEffectPipeline {
  let pipeline = pipelines.get(state);
  if (pipeline === undefined) {
    pipeline = createWgpuDualSourceEffectPipeline(state, WGPU_COMPOSITE_FRAGMENT_WGSL, 'replace');
    pipelines.set(state, pipeline);
  }
  return pipeline;
}

const COMPOSITE_OPERATOR_INDEX: Readonly<Record<string, number>> = {
  [CompositeOperatorValues.SourceOver]: 0,
  [CompositeOperatorValues.DestinationOver]: 1,
  [CompositeOperatorValues.SourceIn]: 2,
  [CompositeOperatorValues.DestinationIn]: 3,
  [CompositeOperatorValues.SourceOut]: 4,
  [CompositeOperatorValues.DestinationOut]: 5,
  [CompositeOperatorValues.SourceAtop]: 6,
  [CompositeOperatorValues.DestinationAtop]: 7,
  [CompositeOperatorValues.Xor]: 8,
  [CompositeOperatorValues.Copy]: 9,
  [CompositeOperatorValues.Clear]: 10,
};

const pipelines = new WeakMap<WgpuRenderState, WgpuDualSourceEffectPipeline>();

export const WGPU_COMPOSITE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  operatorIndex : i32,
  hasBackdrop : i32,
  _pad0 : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var layerTexture : texture_2d<f32>;
@group(1) @binding(1) var layerSampler : sampler;
@group(2) @binding(0) var backdropTexture : texture_2d<f32>;
@group(2) @binding(1) var backdropSampler : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let layer = textureSampleLevel(layerTexture, layerSampler, uv, 0.0);
  let back = select(vec4f(0.0), textureSampleLevel(backdropTexture, backdropSampler, uv, 0.0),
                    uni.hasBackdrop == 1);
  let sourceAlpha = layer.a;
  let backdropAlpha = back.a;
  var sourceFactor = 1.0;
  var backdropFactor = 1.0 - sourceAlpha;
  if (uni.operatorIndex == 1) {
    sourceFactor = 1.0 - backdropAlpha; backdropFactor = 1.0;
  } else if (uni.operatorIndex == 2) {
    sourceFactor = backdropAlpha; backdropFactor = 0.0;
  } else if (uni.operatorIndex == 3) {
    sourceFactor = 0.0; backdropFactor = sourceAlpha;
  } else if (uni.operatorIndex == 4) {
    sourceFactor = 1.0 - backdropAlpha; backdropFactor = 0.0;
  } else if (uni.operatorIndex == 5) {
    sourceFactor = 0.0; backdropFactor = 1.0 - sourceAlpha;
  } else if (uni.operatorIndex == 6) {
    sourceFactor = backdropAlpha; backdropFactor = 1.0 - sourceAlpha;
  } else if (uni.operatorIndex == 7) {
    sourceFactor = 1.0 - backdropAlpha; backdropFactor = sourceAlpha;
  } else if (uni.operatorIndex == 8) {
    sourceFactor = 1.0 - backdropAlpha; backdropFactor = 1.0 - sourceAlpha;
  } else if (uni.operatorIndex == 9) {
    sourceFactor = 1.0; backdropFactor = 0.0;
  } else if (uni.operatorIndex == 10) {
    sourceFactor = 0.0; backdropFactor = 0.0;
  }
  return sourceFactor * layer + backdropFactor * back;
}
`;
