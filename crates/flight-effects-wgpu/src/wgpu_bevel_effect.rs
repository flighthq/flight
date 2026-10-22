// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Bevel (TS `wgpuBevelEffect.ts`): the directional gradient of the blurred silhouette drives a
//! highlight/shadow edge band, clipped by bevelType, then sourceMode decides source compositing.
//! Acquires three scratch targets from the effect pool, runs neutral tint → box blur →
//! directional-gradient composite, then releases them.

use flight_color::{get_color_alpha, get_color_rgb};
use flight_effects::{BevelEffect, BevelType, Effect, EffectSourceMode};
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuRenderTargetPool, WgpuTextureRenderTarget,
    WgpuTextureRenderTargetDescriptor, acquire_wgpu_texture_render_target,
    release_wgpu_texture_render_target,
};

use crate::types::*;
use crate::wgpu_effect_blit_shader::{apply_wgpu_effect_blit_pass, apply_wgpu_effect_erase_pass};
use crate::wgpu_effect_box_blur::apply_wgpu_effect_box_blur;
use crate::wgpu_effect_pass::{
    clear_wgpu_effect_target, create_wgpu_dual_source_effect_pipeline,
    draw_wgpu_dual_source_effect_pass,
};
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_runtime::get_wgpu_effect_module_pipeline;
use crate::wgpu_effect_tint_shader::apply_wgpu_effect_tint_pass;

// Reads the blurred alpha field (group 1) and source (group 2); writes the tinted, clipped bevel
// mask, premultiplied, blended over `dest` (which already holds the source when sourceMode is 'draw').
const BEVEL_COMPOSITE_WGSL: &str = r#"
struct Uniforms {
  highlight : vec4f,
  shadow : vec4f,
  offset : vec2f,
  intensity : f32,
  clipMode : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var fieldTex : texture_2d<f32>;
@group(1) @binding(1) var fieldSmp : sampler;
@group(2) @binding(0) var srcTex : texture_2d<f32>;
@group(2) @binding(1) var srcSmp : sampler;

fn sampleField(uv : vec2f) -> f32 {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 0.0; }
  return textureSampleLevel(fieldTex, fieldSmp, uv, 0.0).a;
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let lit = sampleField(uv - uni.offset);
  let shade = sampleField(uv + uni.offset);
  let gradient = lit - shade;
  let srcA = textureSampleLevel(srcTex, srcSmp, uv, 0.0).a;
  let isHighlight = gradient >= 0.0;
  let color = select(uni.shadow.xyz, uni.highlight.xyz, isHighlight);
  let colorAlpha = select(uni.shadow.w, uni.highlight.w, isHighlight);
  var clip = 1.0;
  if (uni.clipMode == 1.0) { clip = srcA; }
  else if (uni.clipMode == 2.0) { clip = 1.0 - srcA; }
  let edge = min(1.0, abs(gradient) * uni.intensity);
  let a = edge * colorAlpha * clip;
  return vec4f(color * a, a);
}"#;

// The composite pass's parameters (TS `BevelCompositeParams`).
struct BevelCompositeParams {
    offset_x: f32,
    offset_y: f32,
    highlight_color: u32,
    highlight_alpha: f32,
    shadow_color: u32,
    shadow_alpha: f32,
    intensity: f32,
    clip_mode: f32,
}

/// Applies a `BevelEffect` from `source` into `dest`, borrowing three scratch targets from `pool`
/// (TS `applyBevelEffectToWgpu`).
pub fn apply_bevel_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &BevelEffect,
) {
    let descriptor = WgpuTextureRenderTargetDescriptor {
        color_space: None,
        format: Some(source.format),
        height: source.height as f32,
        sample_count: None,
        width: source.width as f32,
    };
    let tinted = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let blurred = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let blur_temp = acquire_wgpu_texture_render_target(state, pool, &descriptor);

    let angle = effect.angle.unwrap_or(45.0) * std::f32::consts::PI / 180.0;
    let distance = effect.distance.unwrap_or(4.0);
    // Match the surface reference, which snaps the light offset to whole pixels.
    let offset_x = (angle.cos() * distance + 0.5).floor();
    let offset_y = (angle.sin() * distance + 0.5).floor();
    // The color is packed RGBA and its alpha multiplies the separate *Alpha field, matching what
    // BitmapBevelOptions does offscreen. The composite still wants RGB plus one alpha, so the split
    // happens here rather than in the shader.
    let shadow_packed = effect.shadow_color.unwrap_or(0x000000ff);
    let shadow_color = get_color_rgb(shadow_packed);
    let shadow_alpha = effect.shadow_alpha.unwrap_or(1.0) * get_color_alpha(shadow_packed);
    let highlight_packed = effect.highlight_color.unwrap_or(0xffffffff);
    let highlight_color = get_color_rgb(highlight_packed);
    let highlight_alpha = effect.highlight_alpha.unwrap_or(1.0) * get_color_alpha(highlight_packed);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = 1.0_f32.max((effect.quality.unwrap_or(1.0) + 0.5).floor());
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);
    let bevel_type = effect.bevel_type.unwrap_or(BevelType::Inner);

    {
        let tinted = tinted.read().unwrap();
        let blurred = blurred.read().unwrap();
        let blur_temp = blur_temp.read().unwrap();
        // Blurred alpha field (neutral white tint, strength 1 — strength is the gradient intensity
        // applied per-pixel in the composite, not baked into the field).
        apply_wgpu_effect_tint_pass(state, source, &tinted, 0xffffffff, 1.0, 1.0);
        apply_wgpu_effect_box_blur(
            state,
            &tinted,
            &blurred,
            &blur_temp,
            &WgpuEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(4.0)),
                blur_y: Some(effect.blur_y.unwrap_or(4.0)),
                passes: Some(quality),
                edge_color: None,
            },
        );

        clear_wgpu_effect_target(state, dest);
        if source_mode == EffectSourceMode::Draw {
            apply_wgpu_effect_blit_pass(state, source, dest);
        }

        apply_wgpu_bevel_composite_pass(
            state,
            &blurred,
            source,
            dest,
            &BevelCompositeParams {
                offset_x: offset_x / source.width as f32,
                offset_y: offset_y / source.height as f32,
                highlight_color,
                highlight_alpha,
                shadow_color,
                shadow_alpha,
                intensity: strength,
                clip_mode: match bevel_type {
                    BevelType::Inner => 1.0,
                    BevelType::Outer => 2.0,
                    BevelType::Full => 0.0,
                },
            },
        );

        if source_mode == EffectSourceMode::Knockout {
            apply_wgpu_effect_erase_pass(state, source, dest);
        }
    }

    release_wgpu_texture_render_target(pool, tinted);
    release_wgpu_texture_render_target(pool, blurred);
    release_wgpu_texture_render_target(pool, blur_temp);
}

fn apply_wgpu_bevel_composite_pass(
    state: &mut WgpuRenderState,
    field: &WgpuTextureRenderTarget,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    params: &BevelCompositeParams,
) {
    let pipeline = get_wgpu_effect_module_pipeline(state, "bevel.composite", |state| {
        return create_wgpu_dual_source_effect_pipeline(state, BEVEL_COMPOSITE_WGSL, None);
    });
    draw_wgpu_dual_source_effect_pass(
        state,
        field,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = ((params.highlight_color >> 16) & 0xff) as f32 / 255.0;
            f32[1] = ((params.highlight_color >> 8) & 0xff) as f32 / 255.0;
            f32[2] = (params.highlight_color & 0xff) as f32 / 255.0;
            f32[3] = params.highlight_alpha;
            f32[4] = ((params.shadow_color >> 16) & 0xff) as f32 / 255.0;
            f32[5] = ((params.shadow_color >> 8) & 0xff) as f32 / 255.0;
            f32[6] = (params.shadow_color & 0xff) as f32 / 255.0;
            f32[7] = params.shadow_alpha;
            f32[8] = params.offset_x;
            f32[9] = params.offset_y;
            f32[10] = params.intensity;
            f32[11] = params.clip_mode;
        },
    );
}

/// Registers the default runner under `BevelEffect` (TS `registerWgpuBevelEffect`).
pub fn register_wgpu_bevel_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "BevelEffect", wgpu_bevel_effect_runner, None);
}

/// The default `BevelEffect` runner (TS `wgpuBevelEffectRunner`).
pub fn wgpu_bevel_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<BevelEffect>(effect, "wgpuBevelEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_bevel_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
