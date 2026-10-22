// flight-lint: allow-file(contract-vocabulary) D17 effect passes own native glow targets, pass handles, texture names and Result diagnostics
//! Opt-in post-process pipeline. The scene renders into the pipeline's (optionally MSAA / HDR)
//! target between begin/end; end resolves MSAA, runs the agnostic effect list through the
//! per-state registry ping-ponging pooled targets, then presents to the default framebuffer. The
//! effect list is per-frame data; only the scene target and pool are retained.

use std::sync::PoisonError;

use flight_adjustments::{
    Adjustment, bake_color_lut_for_run, create_color_lut_cache, fuse_color_matrices,
    get_adjustment_color_matrix, is_color_lut_adjustment,
};
use flight_color::srgb_channel_to_linear;
use flight_effects::EffectStateOptions;
use flight_entity::Ref;
use flight_render::{RenderTargetDescriptor, RenderTargetFormat};
use flight_render_gl::{
    GlRenderPass, GlRenderState, GlTextureRenderTarget, RenderTargetClear,
    acquire_gl_texture_render_target, begin_gl_render_pass, clear_gl_render_target,
    create_gl_texture_render_target, create_gl_texture_render_target_pool,
    destroy_gl_texture_render_target, destroy_gl_texture_render_target_pool, end_gl_render_pass,
    present_gl_render_target, release_gl_texture_render_target, resize_gl_texture_render_target,
};
use flight_texture::RenderTargetColorSpace;
use glow::{HasContext, NativeTexture};

use crate::contract::{
    EffectOperation, GlColorLutTextureCache, GlEffectContext, GlEffectState,
    GlEffectStateSkipGuard, apply_color_lut_pass_to_gl, apply_color_matrix_pass_to_gl,
    get_gl_effect_runner,
};
use crate::gl_effect_support::with_gl_effect_state_runtime;

#[derive(Clone, Copy, PartialEq, Eq)]
enum GlEffectStageTarget {
    Scene,
    ScratchA,
    ScratchB,
}

/// Creates the retained pipeline resources: no scene target yet, an empty pool, an empty LUT bake
/// memo and upload memo, and no velocity texture.
// flight-lint: allow(conform-params) D23 (C) configuration options are optional and read only at construction
pub fn create_gl_effect_state(
    _state: &GlRenderState,
    options: Option<&EffectStateOptions>,
) -> GlEffectState {
    return GlEffectState {
        options: options.cloned().unwrap_or_default(),
        scene_target: None,
        pool: create_gl_texture_render_target_pool(),
        lut_cache: create_color_lut_cache(),
        lut_texture: GlColorLutTextureCache {
            texture: None,
            lut: None,
        },
        velocity_texture: None,
    };
}

/// Starts the scene pass: (re)allocates the pipeline's scene target to the current default
/// framebuffer viewport and begins a render pass into it. `clear` defaults to transparent black
/// with depth 1; `color_space` defaults to sRGB, and a linear scene linearizes the clear color.
// flight-lint: allow(conform-params) D17 the native pass entry returns render-gl's Result diagnostics
pub fn begin_gl_effect_pass(
    state: &mut GlRenderState,
    pipeline: &mut GlEffectState,
    clear: Option<&RenderTargetClear>,
    color_space: Option<RenderTargetColorSpace>,
) -> Result<GlRenderPass, String> {
    let default_clear = RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
    let clear = clear.unwrap_or(&default_clear);
    let color_space = color_space.unwrap_or(RenderTargetColorSpace::Srgb);
    let mut viewport = [0_i32; 4];
    // SAFETY: the query occurs on the owning GL thread. Native GL has no drawing-buffer size; the
    // default framebuffer's viewport stands in for it, as render-gl does for its screen target.
    unsafe {
        state
            .gl
            .get_parameter_i32_slice(glow::VIEWPORT, &mut viewport);
    }
    let w = viewport[2].max(0) as f32;
    let h = viewport[3].max(0) as f32;
    let options = pipeline.options;

    match pipeline.scene_target.as_mut() {
        None => {
            let descriptor = RenderTargetDescriptor {
                width: w,
                height: h,
                format: options.format,
                color_attachments: None,
                color_formats: None,
                sample_count: options.sample_count,
                depth: options.depth,
                color_space: Some(color_space),
            };
            let target =
                create_gl_texture_render_target(state, &descriptor, None)?.ok_or_else(|| {
                    "beginGlEffectPass: preferred scene target allocation was refused".to_string()
                })?;
            pipeline.scene_target = Some(target);
        }
        Some(target) => {
            resize_gl_texture_render_target(state, target, w, h)?;
        }
    }
    let scene = pipeline
        .scene_target
        .as_mut()
        .expect("scene target was just allocated");
    flight_render_gl::GlRenderTarget::set_color_space(scene, color_space);
    let clear = if color_space == RenderTargetColorSpace::Linear {
        linearize_clear(clear)
    } else {
        clear.clone()
    };
    return begin_gl_render_pass(state, scene, Some(&clear), None);
}

pub fn destroy_gl_effect_state(state: &GlRenderState, pipeline: &mut GlEffectState) {
    if let Some(mut target) = pipeline.scene_target.take() {
        destroy_gl_texture_render_target(&mut target);
    }
    destroy_gl_texture_render_target_pool(&mut pipeline.pool);
    if let Some(texture) = pipeline.lut_texture.texture.take() {
        // SAFETY: the LUT texture was created on this state's context by the LUT pass.
        unsafe { state.gl.delete_texture(texture) };
    }
    pipeline.lut_texture.lut = None;
    pipeline.lut_cache.signature = None;
    pipeline.lut_cache.lut = None;
}

/// Ends the scene pass and runs `operations` over the scene target, then presents the result to the
/// default framebuffer. A maximal run of consecutive pointwise adjustments fuses into ONE pass; an
/// effect (or the end of the list) flushes the run first, preserving order. An effect whose kind
/// has no runner is skipped and reported through the skip guard.
// flight-lint: allow(conform-params) D17 native pass handles do not carry their owning render state, so the state is passed explicitly first (as render-gl's end_gl_render_pass)
pub fn end_gl_effect_pass(
    state: &mut GlRenderState,
    pass: &GlRenderPass,
    pipeline: &mut GlEffectState,
    operations: &[EffectOperation],
) -> Result<(), String> {
    let GlEffectState {
        options,
        scene_target,
        pool,
        lut_cache,
        lut_texture,
        velocity_texture,
    } = pipeline;
    let Some(scene) = scene_target.as_ref() else {
        return Ok(());
    };

    end_gl_render_pass(state, pass)?;

    let format = options.format.unwrap_or(RenderTargetFormat::Rgba8);
    // Intermediate ping-pong targets carry the scene's declared color space, so after the last
    // effect the final source still reports whether its content is linear or sRGB.
    let descriptor = RenderTargetDescriptor {
        width: scene.axes.width as f32,
        height: scene.axes.height as f32,
        format: Some(format),
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: Some(scene.axes.color_space),
    };
    let scene_depth_texture = scene.depth_texture;
    let scene_velocity_texture = *velocity_texture;
    let mut scratch_a: Option<GlTextureRenderTarget> = None;
    let mut scratch_b: Option<GlTextureRenderTarget> = None;
    let mut source = GlEffectStageTarget::Scene;
    let mut pending: Vec<Ref<dyn Adjustment>> = Vec::new();

    let result = (|| -> Result<(), String> {
        for operation in operations {
            let effect = match operation {
                EffectOperation::Adjustment(adjustment) => {
                    let fusable = {
                        let guard = adjustment.read().unwrap_or_else(PoisonError::into_inner);
                        get_adjustment_color_matrix(&*guard).is_some()
                            || is_color_lut_adjustment(&*guard)
                    };
                    if fusable {
                        pending.push(adjustment.clone());
                        continue;
                    }
                    // TS would look this adjustment's kind up as an effect runner; a Rust runner
                    // receives `&dyn Effect`, which an adjustment is not, so the stage is reported
                    // as skipped exactly as an unregistered kind is.
                    let kind = adjustment
                        .read()
                        .unwrap_or_else(PoisonError::into_inner)
                        .adjustment_fields()
                        .kind
                        .clone();
                    report_gl_effect_state_skip(state, &kind);
                    continue;
                }
                EffectOperation::Effect(effect) => effect,
            };
            let effect = effect.read().unwrap_or_else(PoisonError::into_inner);
            let Some(runner) = get_gl_effect_runner(state, &effect.effect_fields().kind) else {
                report_gl_effect_state_skip(state, &effect.effect_fields().kind);
                continue;
            };
            source = flush_gl_effect_adjustments(
                state,
                &mut pending,
                source,
                scene,
                &mut scratch_a,
                &mut scratch_b,
                pool,
                &descriptor,
                lut_cache,
                lut_texture,
            )?;
            ensure_gl_effect_scratch(state, pool, &descriptor, &mut scratch_a, &mut scratch_b)?;
            let dest_slot = next_gl_effect_stage(source);
            let source_target = resolve_gl_effect_stage(source, scene, &scratch_a, &scratch_b);
            let dest_target = resolve_gl_effect_stage(dest_slot, scene, &scratch_a, &scratch_b);
            clear_gl_render_target(
                dest_target,
                &RenderTargetClear {
                    color: Some([0.0, 0.0, 0.0, 0.0]),
                    colors: None,
                    depth: None,
                    stencil: None,
                },
            );
            // Depth/velocity always come from the original scene target, not the ping-ponged source.
            let mut context = GlEffectContext {
                state,
                source: source_target,
                dest: dest_target,
                pool,
                scene_depth_texture,
                scene_velocity_texture,
            };
            runner(&mut context, &*effect)?;
            source = dest_slot;
        }
        source = flush_gl_effect_adjustments(
            state,
            &mut pending,
            source,
            scene,
            &mut scratch_a,
            &mut scratch_b,
            pool,
            &descriptor,
            lut_cache,
            lut_texture,
        )?;
        let final_source = resolve_gl_effect_stage(source, scene, &scratch_a, &scratch_b);
        return present_gl_render_target(state, final_source, None);
    })();

    if let Some(target) = scratch_a.take() {
        release_gl_texture_render_target(pool, target);
    }
    if let Some(target) = scratch_b.take() {
        release_gl_texture_render_target(pool, target);
    }
    return result;
}

fn ensure_gl_effect_scratch(
    state: &GlRenderState,
    pool: &mut flight_render_gl::GlTextureRenderTargetPool,
    descriptor: &RenderTargetDescriptor,
    scratch_a: &mut Option<GlTextureRenderTarget>,
    scratch_b: &mut Option<GlTextureRenderTarget>,
) -> Result<(), String> {
    if scratch_a.is_none() {
        *scratch_a = Some(
            acquire_gl_texture_render_target(state, pool, descriptor, None)?.ok_or_else(|| {
                "endGlEffectPass: preferred scratch target allocation was refused".to_string()
            })?,
        );
    }
    if scratch_b.is_none() {
        *scratch_b = Some(
            acquire_gl_texture_render_target(state, pool, descriptor, None)?.ok_or_else(|| {
                "endGlEffectPass: preferred scratch target allocation was refused".to_string()
            })?,
        );
    }
    return Ok(());
}

/// Hands the pending adjustment run one clean destination and fuses it into one pass. Returns the
/// stage now holding the chain's output.
fn flush_gl_effect_adjustments(
    state: &mut GlRenderState,
    pending: &mut Vec<Ref<dyn Adjustment>>,
    source: GlEffectStageTarget,
    scene: &GlTextureRenderTarget,
    scratch_a: &mut Option<GlTextureRenderTarget>,
    scratch_b: &mut Option<GlTextureRenderTarget>,
    pool: &mut flight_render_gl::GlTextureRenderTargetPool,
    descriptor: &RenderTargetDescriptor,
    lut_cache: &mut flight_adjustments::ColorLutCache,
    lut_texture: &mut GlColorLutTextureCache,
) -> Result<GlEffectStageTarget, String> {
    if pending.is_empty() {
        return Ok(source);
    }
    ensure_gl_effect_scratch(state, pool, descriptor, scratch_a, scratch_b)?;
    let dest_slot = next_gl_effect_stage(source);
    let source_target = resolve_gl_effect_stage(source, scene, scratch_a, scratch_b);
    let dest_target = resolve_gl_effect_stage(dest_slot, scene, scratch_a, scratch_b);
    clear_gl_render_target(
        dest_target,
        &RenderTargetClear {
            color: Some([0.0, 0.0, 0.0, 0.0]),
            colors: None,
            depth: None,
            stencil: None,
        },
    );
    let any_lut = pending
        .iter()
        .any(|op| is_color_lut_adjustment(&*op.read().unwrap_or_else(PoisonError::into_inner)));
    if any_lut {
        let lut = bake_color_lut_for_run(lut_cache, pending, None);
        apply_color_lut_pass_to_gl(state, source_target, dest_target, &lut, lut_texture)?;
    } else {
        let mut matrices: Vec<[f32; 20]> = Vec::new();
        for op in pending.iter() {
            let guard = op.read().unwrap_or_else(PoisonError::into_inner);
            if let Some(matrix) = get_adjustment_color_matrix(&*guard) {
                matrices.push(*matrix);
            }
        }
        let references: Vec<&[f32; 20]> = matrices.iter().collect();
        let fused = fuse_color_matrices(&references);
        apply_color_matrix_pass_to_gl(state, source_target, dest_target, &fused.to_vec())?;
    }
    pending.clear();
    return Ok(dest_slot);
}

fn linearize_clear(clear: &RenderTargetClear) -> RenderTargetClear {
    return RenderTargetClear {
        color: clear.color.map(|[r, g, b, a]| {
            [
                srgb_channel_to_linear(r),
                srgb_channel_to_linear(g),
                srgb_channel_to_linear(b),
                a,
            ]
        }),
        colors: clear.colors.as_ref().map(|colors| {
            colors
                .iter()
                .map(|color| {
                    color.map(|[r, g, b, a]| {
                        [
                            srgb_channel_to_linear(r),
                            srgb_channel_to_linear(g),
                            srgb_channel_to_linear(b),
                            a,
                        ]
                    })
                })
                .collect()
        }),
        depth: clear.depth,
        stencil: clear.stencil,
    };
}

fn next_gl_effect_stage(source: GlEffectStageTarget) -> GlEffectStageTarget {
    return if source == GlEffectStageTarget::ScratchA {
        GlEffectStageTarget::ScratchB
    } else {
        GlEffectStageTarget::ScratchA
    };
}

fn report_gl_effect_state_skip(state: &GlRenderState, kind: &str) {
    let guard = with_gl_effect_state_runtime(state, |runtime| runtime.skip_guard.clone());
    if let Some(guard) = guard {
        guard(state, kind);
    }
}

fn resolve_gl_effect_stage<'a>(
    stage: GlEffectStageTarget,
    scene: &'a GlTextureRenderTarget,
    scratch_a: &'a Option<GlTextureRenderTarget>,
    scratch_b: &'a Option<GlTextureRenderTarget>,
) -> &'a GlTextureRenderTarget {
    return match stage {
        GlEffectStageTarget::Scene => scene,
        GlEffectStageTarget::ScratchA => scratch_a.as_ref().expect("scratch A acquired"),
        GlEffectStageTarget::ScratchB => scratch_b.as_ref().expect("scratch B acquired"),
    };
}

/// The diagnostics seam for the pipeline path: `enable_gl_effect_guards` installs the reporter that
/// turns a dropped effect into a caller-facing warning. `None` clears it.
pub fn set_gl_effect_state_skip_guard(
    state: &GlRenderState,
    guard: Option<GlEffectStateSkipGuard>,
) {
    with_gl_effect_state_runtime(state, |runtime| runtime.skip_guard = guard);
}

/// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects this frame, or `None`
/// to clear it.
pub fn set_gl_effect_velocity_texture(
    pipeline: &mut GlEffectState,
    texture: Option<NativeTexture>,
) {
    pipeline.velocity_texture = texture;
}
