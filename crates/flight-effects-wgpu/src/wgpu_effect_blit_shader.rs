// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: blit passes take host-supplied wgpu targets
//! Blit, offset-blit and erase passes shared by the composite recipes (TS
//! `wgpuEffectBlitShader.ts`).

use flight_render_wgpu::{WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::{create_wgpu_effect_pipeline, draw_wgpu_effect_pass};
use crate::wgpu_effect_runtime::get_wgpu_effect_module_pipeline;

// Blits a texture at a UV offset. Out-of-bounds samples produce transparent output.
const BLIT_OFFSET_WGSL: &str = r#"
struct Uniforms {
  offset : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let shifted = uv + uni.offset;
  if (shifted.x < 0.0 || shifted.x > 1.0 || shifted.y < 0.0 || shifted.y > 1.0) {
    return vec4f(0.0);
  }
  return textureSampleLevel(tex, smp, shifted, 0.0);
}"#;

// Pass-through blit. Minimal uniform struct required by the pipeline layout.
const BLIT_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

// Emits source alpha for a destination-out erase pass; blend state supplies the coverage operator.
const ERASE_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(0.0, 0.0, 0.0, a);
}"#;

/// Blits `source` into `dest` at a pixel offset (`dx`, `dy` in screen-space Y-down; TS
/// `applyWgpuEffectBlitOffsetPass`). Pixels sampling outside the source produce transparent
/// output. The shader samples `uv + offset`, so a screen-space shift of (+dx, +dy) needs the UV
/// offset to point the opposite way on both axes; WebGPU UV y = 0 is the top, the same direction as
/// screen space, so a downward shift needs a negative UV offset (unlike GL).
pub fn apply_wgpu_effect_blit_offset_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    dx: f32,
    dy: f32,
) {
    let pipeline = get_wgpu_blit_offset_shader(state);
    let width = source.width as f32;
    let height = source.height as f32;
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = -dx / width;
            f32[1] = -dy / height;
        },
    );
}

/// Blits `source` into `dest` unchanged (TS `applyWgpuEffectBlitPass`).
pub fn apply_wgpu_effect_blit_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
) {
    let pipeline = get_wgpu_blit_shader(state);
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |_, _| {},
    );
}

/// Erases `dest` by the source alpha mask, equivalent to destination-out compositing (TS
/// `applyWgpuEffectErasePass`).
pub fn apply_wgpu_effect_erase_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
) {
    let pipeline = get_wgpu_erase_shader(state);
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |_, _| {},
    );
}

fn get_wgpu_blit_offset_shader(
    state: &mut WgpuRenderState,
) -> flight_entity::Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "blit.offset", |state| {
        return create_wgpu_effect_pipeline(state, BLIT_OFFSET_WGSL, None);
    });
}

fn get_wgpu_blit_shader(state: &mut WgpuRenderState) -> flight_entity::Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "blit", |state| {
        return create_wgpu_effect_pipeline(state, BLIT_WGSL, None);
    });
}

fn get_wgpu_erase_shader(state: &mut WgpuRenderState) -> flight_entity::Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "blit.erase", |state| {
        return create_wgpu_effect_pipeline(state, ERASE_WGSL, Some(WgpuEffectBlendMode::Erase));
    });
}
