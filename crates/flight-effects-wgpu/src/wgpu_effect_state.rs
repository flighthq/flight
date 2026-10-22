// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the pipeline state holds host-supplied wgpu targets and textures
//! The opt-in post-process pipeline (TS `wgpuEffectState.ts`), the WebGPU mirror of effects-gl's
//! effect state. The caller opens a pass on the screen, then:
//! `begin_wgpu_effect_pass(pass, …)` opens a pass into the pipeline's offscreen scene target; the
//! caller draws the scene into it; `end_wgpu_effect_pass(scene_pass, pipeline, operations)` ends it,
//! runs the backend-neutral operation list through the per-state registry ping-ponging pooled
//! targets, and presents into the enclosing pass. The operation list is per-frame data; only the
//! scene target and pool are retained. Depth and velocity G-buffers are not yet produced: depth-
//! and velocity-driven recipes receive `None` and fall back to their color-only paths.

use flight_render::RenderTargetClear;
use std::sync::{Arc, RwLock};

use flight_adjustments::{
    Adjustment, bake_color_lut_for_run, create_color_lut_cache, fuse_color_matrices,
    get_adjustment_color_matrix, is_color_lut_adjustment,
};
use flight_color::srgb_channel_to_linear;
use flight_effects::EffectStateOptions;
use flight_entity::Ref;
use flight_render::RenderTargetFormat;
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderPass, WgpuRenderState, WgpuRenderTarget, WgpuTextureRenderTarget,
    WgpuTextureRenderTargetDescriptor, acquire_wgpu_texture_render_target, begin_wgpu_render_pass,
    create_wgpu_render_target_pool, create_wgpu_texture_render_target,
    destroy_wgpu_render_target_pool, destroy_wgpu_texture_render_target, end_wgpu_render_pass,
    get_wgpu_active_render_pass, get_wgpu_render_state_runtime, release_wgpu_texture_render_target,
    resize_wgpu_texture_render_target, resume_wgpu_render_pass,
};
use flight_texture::RenderTargetColorSpace;

use crate::types::*;
use crate::wgpu_color_lut_pass::apply_color_lut_pass_to_wgpu;
use crate::wgpu_color_matrix_pass::apply_color_matrix_pass_to_wgpu;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::get_wgpu_effect_runner;
use crate::wgpu_effect_runtime::{get_wgpu_effect_runtime, peek_wgpu_effect_runtime};

// The ping-pong bookkeeping of one end_wgpu_effect_pass call.
struct WgpuEffectChainRun {
    source: Ref<WgpuTextureRenderTarget>,
    scratch_a: Option<Ref<WgpuTextureRenderTarget>>,
    scratch_b: Option<Ref<WgpuTextureRenderTarget>>,
    pending: Vec<Ref<dyn Adjustment>>,
}

const PRESENT_FRAGMENT_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

const LINEAR_PRESENT_FRAGMENT_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn linearToSrgb(c0 : vec3f) -> vec3f {
  let c = max(c0, vec3f(0.0));
  let low = c * 12.92;
  let high = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3f(0.0031308), c));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let linear = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(linearToSrgb(linear.rgb), linear.a);
}"#;

/// A pipeline with nothing allocated yet (TS `createWgpuEffectState`). Sample counts other than 1
/// and 4 are substituted (above 1 becomes 4) and reported through the sample-count guard.
pub fn create_wgpu_effect_state(
    state: &WgpuRenderState,
    options: Option<&EffectStateOptions>,
) -> WgpuEffectState {
    let options = options.copied().unwrap_or_default();
    let requested_sample_count = options.sample_count.unwrap_or(1.0);
    let applied_sample_count = if requested_sample_count > 1.0 {
        4.0
    } else {
        1.0
    };
    if requested_sample_count != applied_sample_count {
        let guard =
            peek_wgpu_effect_runtime(state).and_then(|runtime| runtime.sample_count_guard.clone());
        if let Some(guard) = guard {
            guard(state, requested_sample_count, applied_sample_count);
        }
    }
    return WgpuEffectState {
        options: EffectStateOptions {
            sample_count: Some(applied_sample_count),
            ..options
        },
        scene_target: None,
        pool: create_wgpu_render_target_pool(),
        lut_cache: create_color_lut_cache(),
        lut_texture: WgpuColorLutTextureCache {
            texture: None,
            size: 0,
            lut: None,
        },
        velocity_texture: None,
    };
}

/// Opens a pass into the pipeline's scene target, sized to `pass`'s viewport (TS
/// `beginWgpuEffectPass`). The scene target is allocated on first begin and resized afterwards.
/// `clear` is the scene target's clear, given explicitly per pass; it defaults to transparent black
/// with depth 1. `color_space` defaults to sRGB; a linear scene target linearizes the clear color.
pub fn begin_wgpu_effect_pass<'a>(
    pass: &'a mut WgpuRenderPass<'_>,
    pipeline: &mut WgpuEffectState,
    clear: Option<&RenderTargetClear>,
    color_space: Option<RenderTargetColorSpace>,
) -> WgpuRenderPass<'a> {
    let index = pass.index;
    let state: &'a mut WgpuRenderState = &mut *pass.state;
    let viewport = get_wgpu_render_state_runtime(state).pass_stack[index].viewport;
    let (w, h) = (viewport.width, viewport.height);
    let color_space = color_space.unwrap_or(RenderTargetColorSpace::Srgb);
    let format = if pipeline.options.format == Some(RenderTargetFormat::Rgba16F) {
        wgpu::TextureFormat::Rgba16Float
    } else {
        state.format
    };
    let sample_count = pipeline.options.sample_count.map(|value| value as u32);
    let scene = match &pipeline.scene_target {
        None => {
            let created = create_wgpu_texture_render_target(
                state,
                w,
                h,
                Some(format),
                Some(color_space),
                sample_count,
            );
            let created: Ref<WgpuTextureRenderTarget> = Arc::new(RwLock::new(created));
            pipeline.scene_target = Some(created.clone());
            created
        }
        Some(scene) => {
            resize_wgpu_texture_render_target(
                state,
                &mut scene.write().unwrap(),
                w,
                h,
                sample_count,
            );
            scene.clone()
        }
    };
    scene.write().unwrap().color_space = color_space;
    let default_clear = RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
    let clear = clear.unwrap_or(&default_clear);
    let clear = if color_space == RenderTargetColorSpace::Linear {
        linearize_clear(clear)
    } else {
        clear.clone()
    };
    return begin_wgpu_render_pass(state, &WgpuRenderTarget::Texture(scene), Some(&clear));
}

/// Releases the scene target, the pool's free targets and the LUT texture, and clears the LUT
/// memos (TS `destroyWgpuEffectState`). Safe on a pipeline that never began, and idempotent.
pub fn destroy_wgpu_effect_state(_state: &WgpuRenderState, pipeline: &mut WgpuEffectState) {
    if let Some(scene) = pipeline.scene_target.take() {
        destroy_wgpu_texture_render_target(&scene.read().unwrap());
    }
    destroy_wgpu_render_target_pool(&mut pipeline.pool);
    if let Some(texture) = pipeline.lut_texture.texture.take() {
        texture.destroy();
    }
    pipeline.lut_texture.size = 0;
    pipeline.lut_texture.lut = None;
    pipeline.lut_cache.signature = None;
    pipeline.lut_cache.lut = None;
}

/// Ends the scene pass, runs `operations` through the registry, and presents the result into the
/// enclosing pass (TS `endWgpuEffectPass`). A maximal run of consecutive pointwise adjustments
/// fuses into ONE pass: all matrix-tier into one 4x5 matrix, any LUT-tier member bakes the whole
/// run into one color LUT. An effect (or the end of the list) breaks the run and flushes it first,
/// preserving order. Returns without touching anything when no scene target was begun.
pub fn end_wgpu_effect_pass(
    scene_pass: WgpuRenderPass<'_>,
    pipeline: &mut WgpuEffectState,
    operations: &[WgpuEffectOperation],
) {
    let index = scene_pass.index;
    let state = scene_pass.state;
    let Some(scene) = pipeline.scene_target.clone() else {
        return;
    };

    // End the scene pass; the enclosing pass resumes with load and receives the presented result.
    end_wgpu_render_pass(WgpuRenderPass {
        state: &mut *state,
        index,
    });

    let descriptor = {
        let scene = scene.read().unwrap();
        WgpuTextureRenderTargetDescriptor {
            color_space: Some(scene.color_space),
            format: Some(scene.format),
            height: scene.height as f32,
            sample_count: None,
            width: scene.width as f32,
        }
    };
    let mut run = WgpuEffectChainRun {
        source: scene,
        scratch_a: None,
        scratch_b: None,
        pending: Vec::new(),
    };

    for operation in operations {
        let kind = match operation {
            WgpuEffectOperation::Adjustment(adjustment) => {
                let adjustment_guard = adjustment.read().unwrap();
                if get_adjustment_color_matrix(&*adjustment_guard).is_some()
                    || is_color_lut_adjustment(&*adjustment_guard)
                {
                    run.pending.push(adjustment.clone());
                    continue;
                }
                adjustment_guard.adjustment_fields().kind.clone()
            }
            WgpuEffectOperation::Effect(effect) => {
                effect.read().unwrap().effect_fields().kind.clone()
            }
        };
        let runner = get_wgpu_effect_runner(state, &kind);
        // A non-pointwise adjustment dispatches by kind in the source; a Rust runner takes an
        // effect intent, so an adjustment without a color tier is reported as skipped.
        let (Some(runner), WgpuEffectOperation::Effect(effect)) = (runner, operation) else {
            report_wgpu_effect_state_skip(state, &kind);
            continue;
        };
        flush_adjustments(state, pipeline, &mut run, &descriptor);
        ensure_scratch(state, pipeline, &mut run, &descriptor);
        let dest = next_destination(&run);
        {
            let effect = effect.read().unwrap();
            let mut context = WgpuEffectContext {
                state: &mut *state,
                source: run.source.clone(),
                dest: dest.clone(),
                pool: &mut pipeline.pool,
                // Depth and velocity G-buffers are not yet produced for WebGPU; depth- and
                // velocity-driven recipes fall back to color-only when absent.
                scene_depth_texture: None,
                scene_velocity_texture: pipeline.velocity_texture.clone(),
            };
            runner(&mut context, &*effect);
        }
        run.source = dest;
    }
    flush_adjustments(state, pipeline, &mut run, &descriptor);

    present_wgpu_effect_result(state, &run.source.read().unwrap());
    // The chain recorded its fullscreen passes beside the enclosing pass; hand that pass its encoder
    // back so the caller's own end closes a live bracket.
    if let Some(enclosing) = get_wgpu_active_render_pass(state)
        && !enclosing.has_encoder
    {
        let index = get_wgpu_render_state_runtime(state).pass_stack.len() - 1;
        resume_wgpu_render_pass(&mut WgpuRenderPass {
            state: &mut *state,
            index,
        });
    }

    if let Some(scratch) = run.scratch_a.take() {
        release_wgpu_texture_render_target(&mut pipeline.pool, scratch);
    }
    if let Some(scratch) = run.scratch_b.take() {
        release_wgpu_texture_render_target(&mut pipeline.pool, scratch);
    }
}

fn ensure_scratch(
    state: &mut WgpuRenderState,
    pipeline: &mut WgpuEffectState,
    run: &mut WgpuEffectChainRun,
    descriptor: &WgpuTextureRenderTargetDescriptor,
) {
    if run.scratch_a.is_none() {
        run.scratch_a = Some(acquire_wgpu_texture_render_target(
            state,
            &mut pipeline.pool,
            descriptor,
        ));
    }
    if run.scratch_b.is_none() {
        run.scratch_b = Some(acquire_wgpu_texture_render_target(
            state,
            &mut pipeline.pool,
            descriptor,
        ));
    }
}

fn flush_adjustments(
    state: &mut WgpuRenderState,
    pipeline: &mut WgpuEffectState,
    run: &mut WgpuEffectChainRun,
    descriptor: &WgpuTextureRenderTargetDescriptor,
) {
    if run.pending.is_empty() {
        return;
    }
    ensure_scratch(state, pipeline, run, descriptor);
    let dest = next_destination(run);
    let pending = std::mem::take(&mut run.pending);
    let has_lut = pending
        .iter()
        .any(|operation| is_color_lut_adjustment(&*operation.read().unwrap()));
    {
        let source = run.source.read().unwrap();
        let dest = dest.read().unwrap();
        if has_lut {
            let lut = bake_color_lut_for_run(&mut pipeline.lut_cache, &pending, None);
            apply_color_lut_pass_to_wgpu(state, &source, &dest, &lut, &mut pipeline.lut_texture);
        } else {
            let mut matrices: Vec<[f32; 20]> = Vec::new();
            for operation in &pending {
                if let Some(matrix) = get_adjustment_color_matrix(&*operation.read().unwrap()) {
                    matrices.push(*matrix);
                }
            }
            let references: Vec<&[f32; 20]> = matrices.iter().collect();
            let fused = fuse_color_matrices(&references);
            apply_color_matrix_pass_to_wgpu(state, &source, &dest, &fused.to_vec());
        }
    }
    run.source = dest;
}

// sRGB-encoded clear colors are converted to the linear working space of a linear scene target.
fn linearize_clear(clear: &RenderTargetClear) -> RenderTargetClear {
    let linearize = |c: [f32; 4]| -> [f32; 4] {
        return [
            srgb_channel_to_linear(c[0]),
            srgb_channel_to_linear(c[1]),
            srgb_channel_to_linear(c[2]),
            c[3],
        ];
    };
    return RenderTargetClear {
        color: clear.color.map(linearize),
        colors: clear
            .colors
            .as_ref()
            .map(|colors| colors.iter().map(|color| color.map(linearize)).collect()),
        depth: clear.depth,
        stencil: clear.stencil,
    };
}

// The scratch target the next stage writes: whichever of the pair is not the current source.
fn next_destination(run: &WgpuEffectChainRun) -> Ref<WgpuTextureRenderTarget> {
    let scratch_a = run
        .scratch_a
        .as_ref()
        .expect("scratch targets are acquired");
    let scratch_b = run
        .scratch_b
        .as_ref()
        .expect("scratch targets are acquired");
    return if Arc::ptr_eq(&run.source, scratch_a) {
        scratch_b.clone()
    } else {
        scratch_a.clone()
    };
}

// Presents the final result into the enclosing pass's attachment with REPLACE, not premultiplied
// compositing: the scene target already holds the finished frame, so compositing it would let the
// enclosing clear show through wherever the frame's own alpha is zero.
fn present_wgpu_effect_result(state: &mut WgpuRenderState, source: &WgpuTextureRenderTarget) {
    if get_wgpu_render_state_runtime(state)
        .command_encoder
        .is_none()
    {
        return;
    }
    let linear = source.color_space == RenderTargetColorSpace::Linear;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        if linear {
            "effect.present.linear"
        } else {
            "effect.present"
        },
        if linear {
            LINEAR_PRESENT_FRAGMENT_WGSL
        } else {
            PRESENT_FRAGMENT_WGSL
        },
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        None,
        &mut pipeline.write().unwrap(),
        &mut |_, _| {},
    );
}

fn report_wgpu_effect_state_skip(state: &WgpuRenderState, kind: &str) {
    let guard = peek_wgpu_effect_runtime(state).and_then(|runtime| runtime.skip_guard.clone());
    if let Some(guard) = guard {
        guard(state, kind);
    }
}

/// Installs or (with `None`) clears the sample-count substitution reporter (TS
/// `setWgpuEffectStateSampleCountGuard`): the diagnostics seam the guard module fills.
pub fn set_wgpu_effect_state_sample_count_guard(
    state: &mut WgpuRenderState,
    guard: Option<WgpuEffectStateSampleCountGuard>,
) {
    get_wgpu_effect_runtime(state).sample_count_guard = guard;
}

/// Installs or (with `None`) clears the dropped-effect reporter (TS
/// `setWgpuEffectStateSkipGuard`): the pipeline drops an unregistered kind with a bare skip, and
/// this seam is the only way that is observable.
pub fn set_wgpu_effect_state_skip_guard(
    state: &mut WgpuRenderState,
    guard: Option<WgpuEffectStateSkipGuard>,
) {
    get_wgpu_effect_runtime(state).skip_guard = guard;
}

/// Sets the velocity G-buffer the pipeline feeds velocity-driven effects this frame, or `None` to
/// clear it (TS `setWgpuEffectVelocityTexture`).
pub fn set_wgpu_effect_velocity_texture(
    pipeline: &mut WgpuEffectState,
    texture: Option<wgpu::Texture>,
) {
    pipeline.velocity_texture = texture;
}
