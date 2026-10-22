// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Porter-Duff coverage composite over the same named backdrop registry as the blend effect (TS
//! `wgpuCompositeEffect.ts`). Both inputs are premultiplied, so one Fa/Fb pair applies to RGB and
//! alpha exactly as the composite operator math specifies.

use flight_effects::{
    COMPOSITE_OPERATOR_CLEAR, COMPOSITE_OPERATOR_COPY, COMPOSITE_OPERATOR_DESTINATION_ATOP,
    COMPOSITE_OPERATOR_DESTINATION_IN, COMPOSITE_OPERATOR_DESTINATION_OUT,
    COMPOSITE_OPERATOR_DESTINATION_OVER, COMPOSITE_OPERATOR_SOURCE_ATOP,
    COMPOSITE_OPERATOR_SOURCE_IN, COMPOSITE_OPERATOR_SOURCE_OUT, COMPOSITE_OPERATOR_SOURCE_OVER,
    COMPOSITE_OPERATOR_XOR, CompositeEffect, Effect,
};
use flight_entity::Ref;
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_blend_effect::get_wgpu_blend_effect_backdrop;
use crate::wgpu_effect_pass::{
    create_wgpu_dual_source_effect_pipeline, draw_wgpu_dual_source_effect_pass,
};
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_runtime::get_wgpu_effect_module_pipeline;

pub const WGPU_COMPOSITE_FRAGMENT_WGSL: &str = r#"
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
"#;

/// Composites `source` over the effect's registered backdrop into `dest` (TS
/// `applyCompositeEffectToWgpu`).
pub fn apply_composite_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &CompositeEffect,
) {
    let backdrop = get_wgpu_blend_effect_backdrop(state, effect.backdrop_key.as_deref());
    let has_backdrop = backdrop.is_some();
    let operator_index = get_wgpu_composite_effect_operator_index(&effect.operator);
    let pipeline = get_wgpu_composite_effect_pipeline(state);
    let backdrop_guard = backdrop.as_ref().map(|backdrop| backdrop.read().unwrap());
    let second: &WgpuTextureRenderTarget = match &backdrop_guard {
        Some(guard) => guard,
        None => source,
    };
    draw_wgpu_dual_source_effect_pass(
        state,
        source,
        second,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |_, i32| {
            i32[0] = operator_index;
            i32[1] = if has_backdrop { 1 } else { 0 };
        },
    );
}

/// The shader branch of a composite operator (TS `getWgpuCompositeEffectOperatorIndex`); unknown
/// values composite as SourceOver.
pub fn get_wgpu_composite_effect_operator_index(operator: &str) -> i32 {
    return match operator {
        COMPOSITE_OPERATOR_SOURCE_OVER => 0,
        COMPOSITE_OPERATOR_DESTINATION_OVER => 1,
        COMPOSITE_OPERATOR_SOURCE_IN => 2,
        COMPOSITE_OPERATOR_DESTINATION_IN => 3,
        COMPOSITE_OPERATOR_SOURCE_OUT => 4,
        COMPOSITE_OPERATOR_DESTINATION_OUT => 5,
        COMPOSITE_OPERATOR_SOURCE_ATOP => 6,
        COMPOSITE_OPERATOR_DESTINATION_ATOP => 7,
        COMPOSITE_OPERATOR_XOR => 8,
        COMPOSITE_OPERATOR_COPY => 9,
        COMPOSITE_OPERATOR_CLEAR => 10,
        _ => 0,
    };
}

fn get_wgpu_composite_effect_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "composite.porterDuff", |state| {
        return create_wgpu_dual_source_effect_pipeline(
            state,
            WGPU_COMPOSITE_FRAGMENT_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
}

/// Registers the default runner under `CompositeEffect` (TS `registerWgpuCompositeEffect`).
pub fn register_wgpu_composite_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "CompositeEffect", wgpu_composite_effect_runner, None);
}

/// The default `CompositeEffect` runner (TS `wgpuCompositeEffectRunner`).
pub fn wgpu_composite_effect_runner(context: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<CompositeEffect>(effect, "wgpuCompositeEffectRunner");
    let source = context.source.read().unwrap();
    let dest = context.dest.read().unwrap();
    apply_composite_effect_to_wgpu(context.state, &source, &dest, effect);
}
