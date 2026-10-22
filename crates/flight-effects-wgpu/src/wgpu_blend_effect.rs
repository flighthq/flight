// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and borrowed backdrop targets
//! Advanced-blend composite pass (TS `wgpuBlendEffect.ts`): reads the incoming layer and an
//! explicitly registered backdrop, applies the same W3C straight-color blend math as the GL blend
//! effect, then writes premultiplied source-over output. A missing backdrop uses the layer as a
//! harmless second binding and the uniform gate reduces the operation to passthrough.

use flight_effects::{
    ADVANCED_BLEND_MODE_COLOR, ADVANCED_BLEND_MODE_COLOR_BURN, ADVANCED_BLEND_MODE_COLOR_DODGE,
    ADVANCED_BLEND_MODE_DARKEN, ADVANCED_BLEND_MODE_DIFFERENCE, ADVANCED_BLEND_MODE_EXCLUSION,
    ADVANCED_BLEND_MODE_HARD_LIGHT, ADVANCED_BLEND_MODE_HUE, ADVANCED_BLEND_MODE_LIGHTEN,
    ADVANCED_BLEND_MODE_LUMINOSITY, ADVANCED_BLEND_MODE_OVERLAY, ADVANCED_BLEND_MODE_SATURATION,
    ADVANCED_BLEND_MODE_SOFT_LIGHT, BlendEffect, Effect,
};
use flight_entity::Ref;
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::{
    create_wgpu_dual_source_effect_pipeline, draw_wgpu_dual_source_effect_pass,
};
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_runtime::{
    get_wgpu_effect_module_pipeline, get_wgpu_effect_runtime, peek_wgpu_effect_runtime,
};

// Layer and backdrop are premultiplied textures. Blend math operates on straight RGB, follows the W3C
// compositing formulas used by effects/blendModeMath and glBlendEffect, then premultiplies the result.
pub const WGPU_BLEND_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  mode : i32,
  opacity : f32,
  hasBackdrop : i32,
  _pad0 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var layerTexture : texture_2d<f32>;
@group(1) @binding(1) var layerSampler : sampler;
@group(2) @binding(0) var backdropTexture : texture_2d<f32>;
@group(2) @binding(1) var backdropSampler : sampler;

fn lum(c : vec3f) -> f32 {
  return dot(c, vec3f(0.3, 0.59, 0.11));
}

fn sat(c : vec3f) -> f32 {
  return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
}

fn clipColor(inputColor : vec3f) -> vec3f {
  var c = inputColor;
  let l = lum(c);
  let mn = min(min(c.r, c.g), c.b);
  let mx = max(max(c.r, c.g), c.b);
  if (mn < 0.0) {
    c = vec3f(l) + (c - vec3f(l)) * l / (l - mn);
  }
  if (mx > 1.0) {
    c = vec3f(l) + (c - vec3f(l)) * (1.0 - l) / (mx - l);
  }
  return c;
}

fn setLum(c : vec3f, l : f32) -> vec3f {
  return clipColor(c + vec3f(l - lum(c)));
}

fn setSat(c : vec3f, s : f32) -> vec3f {
  let mn = min(min(c.r, c.g), c.b);
  let mx = max(max(c.r, c.g), c.b);
  let md = c.r + c.g + c.b - mn - mx;
  let rmid = select(0.0, (md - mn) * s / (mx - mn), mx > mn);
  let rmax = select(0.0, s, mx > mn);
  var out = vec3f(0.0);
  out.r = select(select(rmid, 0.0, c.r == mn), rmax, c.r == mx);
  out.g = select(select(rmid, 0.0, c.g == mn), rmax, c.g == mx);
  out.b = select(select(rmid, 0.0, c.b == mn), rmax, c.b == mx);
  return out;
}

fn sepChannel(mode : i32, cb : f32, cs : f32) -> f32 {
  if (mode == 0) {
    return select(1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), 2.0 * cb * cs, cb <= 0.5);
  }
  if (mode == 1) {
    return select(1.0 - 2.0 * (1.0 - cb) * (1.0 - cs), 2.0 * cb * cs, cs <= 0.5);
  }
  if (mode == 2) {
    let d = select(sqrt(cb), ((16.0 * cb - 12.0) * cb + 4.0) * cb, cb <= 0.25);
    return select(cb + (2.0 * cs - 1.0) * (d - cb), cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb), cs <= 0.5);
  }
  if (mode == 3) { return abs(cb - cs); }
  if (mode == 4) { return cb + cs - 2.0 * cb * cs; }
  if (mode == 5) {
    if (cb <= 0.0) { return 0.0; }
    return select(min(1.0, cb / (1.0 - cs)), 1.0, cs >= 1.0);
  }
  if (mode == 6) {
    if (cb >= 1.0) { return 1.0; }
    return select(1.0 - min(1.0, (1.0 - cb) / cs), 0.0, cs <= 0.0);
  }
  if (mode == 11) { return min(cb, cs); }
  if (mode == 12) { return max(cb, cs); }
  return cs;
}

fn blendRgb(mode : i32, cb : vec3f, cs : vec3f) -> vec3f {
  if (mode == 7) { return setLum(setSat(cs, sat(cb)), lum(cb)); }
  if (mode == 8) { return setLum(setSat(cb, sat(cs)), lum(cb)); }
  if (mode == 9) { return setLum(cs, lum(cb)); }
  if (mode == 10) { return setLum(cb, lum(cs)); }
  return vec3f(
    sepChannel(mode, cb.r, cs.r),
    sepChannel(mode, cb.g, cs.g),
    sepChannel(mode, cb.b, cs.b),
  );
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let layer = textureSampleLevel(layerTexture, layerSampler, uv, 0.0);
  if (uni.hasBackdrop == 0) {
    return layer;
  }
  let back = textureSampleLevel(backdropTexture, backdropSampler, uv, 0.0);
  let cs = select(vec3f(0.0), layer.rgb / layer.a, layer.a > 0.0);
  let cb = select(vec3f(0.0), back.rgb / back.a, back.a > 0.0);
  let sourceAlpha = layer.a * uni.opacity;
  let backdropAlpha = back.a;
  let blended = blendRgb(uni.mode, cb, cs);
  let mixed = (1.0 - backdropAlpha) * cs + backdropAlpha * blended;
  let outAlpha = sourceAlpha + backdropAlpha * (1.0 - sourceAlpha);
  let outRgb = mixed * sourceAlpha + cb * backdropAlpha * (1.0 - sourceAlpha);
  return vec4f(outRgb, outAlpha);
}
"#;

/// Blends `source` over the effect's registered backdrop into `dest` (TS `applyBlendEffectToWgpu`).
pub fn apply_blend_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &BlendEffect,
) {
    let backdrop = get_wgpu_blend_effect_backdrop(state, effect.backdrop_key.as_deref());
    let pipeline = get_wgpu_blend_effect_pipeline(state);
    let mode_index = get_wgpu_blend_effect_mode_index(&effect.mode);
    let opacity = effect.opacity.unwrap_or(1.0);
    let has_backdrop = backdrop.is_some();
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
        &mut |f32, i32| {
            i32[0] = mode_index;
            f32[1] = opacity;
            i32[2] = if has_backdrop { 1 } else { 0 };
        },
    );
}

/// The borrowed backdrop target registered under a key on this state, or `None` when absent (TS
/// `getWgpuBlendEffectBackdrop`).
pub fn get_wgpu_blend_effect_backdrop(
    state: &WgpuRenderState,
    backdrop_key: Option<&str>,
) -> Option<Ref<WgpuTextureRenderTarget>> {
    let backdrop_key = backdrop_key?;
    return peek_wgpu_effect_runtime(state)
        .and_then(|runtime| runtime.blend_backdrops.get(backdrop_key).cloned());
}

/// Maps an advanced blend mode to the shader's branch order (TS `getWgpuBlendEffectModeIndex`).
/// Unknown vendor values map to -1, whose shader fallback is Normal source color.
pub fn get_wgpu_blend_effect_mode_index(mode: &str) -> i32 {
    return match mode {
        ADVANCED_BLEND_MODE_OVERLAY => 0,
        ADVANCED_BLEND_MODE_HARD_LIGHT => 1,
        ADVANCED_BLEND_MODE_SOFT_LIGHT => 2,
        ADVANCED_BLEND_MODE_DIFFERENCE => 3,
        ADVANCED_BLEND_MODE_EXCLUSION => 4,
        ADVANCED_BLEND_MODE_COLOR_DODGE => 5,
        ADVANCED_BLEND_MODE_COLOR_BURN => 6,
        ADVANCED_BLEND_MODE_HUE => 7,
        ADVANCED_BLEND_MODE_SATURATION => 8,
        ADVANCED_BLEND_MODE_COLOR => 9,
        ADVANCED_BLEND_MODE_LUMINOSITY => 10,
        ADVANCED_BLEND_MODE_DARKEN => 11,
        ADVANCED_BLEND_MODE_LIGHTEN => 12,
        _ => -1,
    };
}

fn get_wgpu_blend_effect_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "blend.composite", |state| {
        return create_wgpu_dual_source_effect_pipeline(
            state,
            WGPU_BLEND_FRAGMENT_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
}

/// Registers the default runner under `BlendEffect` (TS `registerWgpuBlendEffect`).
pub fn register_wgpu_blend_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "BlendEffect", wgpu_blend_effect_runner, None);
}

/// Registers a borrowed render target as a named backdrop (TS `registerWgpuBlendEffectBackdrop`).
/// Last write wins; the registry never owns or destroys the target, so its caller keeps it alive
/// until the BlendEffect pass completes.
pub fn register_wgpu_blend_effect_backdrop(
    state: &mut WgpuRenderState,
    backdrop_key: &str,
    target: Ref<WgpuTextureRenderTarget>,
) {
    get_wgpu_effect_runtime(state)
        .blend_backdrops
        .insert(backdrop_key.to_string(), target);
}

/// Removes a borrowed backdrop reference without destroying the target (TS
/// `unregisterWgpuBlendEffectBackdrop`).
pub fn unregister_wgpu_blend_effect_backdrop(state: &mut WgpuRenderState, backdrop_key: &str) -> bool {
    return get_wgpu_effect_runtime(state)
        .blend_backdrops
        .remove(backdrop_key)
        .is_some();
}

/// The default `BlendEffect` runner (TS `wgpuBlendEffectRunner`).
pub fn wgpu_blend_effect_runner(context: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<BlendEffect>(effect, "wgpuBlendEffectRunner");
    let source = context.source.read().unwrap();
    let dest = context.dest.read().unwrap();
    apply_blend_effect_to_wgpu(context.state, &source, &dest, effect);
}
