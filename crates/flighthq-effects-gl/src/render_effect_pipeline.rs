//! Opt-in GL post-process effect pipeline.
//!
//! The scene renders into the pipeline's (optionally MSAA / HDR) target
//! between `begin_gl_render_effect_pipeline` and
//! `end_gl_render_effect_pipeline`; `end` resolves MSAA, runs the agnostic
//! effect list through the per-state registry ping-ponging pooled targets, and
//! presents the result to the canvas.
//!
//! The per-frame effect list is plain data; only the scene target and pool are
//! retained in the pipeline struct.  The default render loop imports none of
//! this.
//!
//! Mirrors the TS `renderEffectPipeline` from `effects-webgl` and the WGPU
//! `render_effect_pipeline` from `effects-wgpu`.

use flighthq_effects::RenderEffect;
use flighthq_render_gl::render_target::{
    begin_gl_render_target, create_gl_render_target, destroy_gl_render_target,
    end_gl_render_target, resize_gl_render_target, resolve_gl_render_target,
};
use flighthq_render_gl::render_target_pool::{
    GlRenderTargetPool, acquire_gl_render_target, create_gl_render_target_pool,
    destroy_gl_render_target_pool, get_gl_render_target, release_gl_render_target,
};
use flighthq_render_gl::{GlRenderState, GlRenderTarget, GlRenderTargetFormat};

use crate::effect_program_cache::{draw_gl_effect_fullscreen_pass, get_gl_effect_program};
use crate::render_effect_registry::{
    GlRenderEffectContext, get_gl_render_effect_runner, gl_render_effect_type,
};

// ---------------------------------------------------------------------------
// Pipeline options
// ---------------------------------------------------------------------------

/// Depth attachment mode for the pipeline scene target.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum GlPipelineDepth {
    /// No depth attachment.
    #[default]
    None,
    /// Depth/stencil renderbuffer (write-only; not sampleable).
    DepthStencil,
    /// Sampleable depth texture (enables depth-driven effects like SSAO, DoF,
    /// screen-space fog).
    DepthStencilSampled,
}

/// Options for creating a [`GlRenderEffectPipeline`].
#[derive(Clone, Debug, Default)]
pub struct GlRenderEffectPipelineOptions {
    /// MSAA sample count on the scene target.  Default 1.
    pub sample_count: Option<u32>,
    /// Color format of the scene target.  Use `Rgba16F` for HDR bloom /
    /// tone-mapping.  Default `Rgba8`.
    pub format: Option<GlRenderTargetFormat>,
    /// Depth attachment for depth-driven effects (SSAO, DoF, fog).
    pub depth: Option<GlPipelineDepth>,
}

// ---------------------------------------------------------------------------
// Pipeline struct
// ---------------------------------------------------------------------------

/// Retains the GPU resources an effect pass needs across frames.
///
/// The per-frame effect list is data passed to
/// [`end_gl_render_effect_pipeline`], not stored here.
pub struct GlRenderEffectPipeline {
    pub options: GlRenderEffectPipelineOptions,
    /// The off-screen scene target; `None` until the first frame.
    pub scene_target: Option<GlRenderTarget>,
    /// Intermediate-target pool for multi-pass recipes.
    pub pool: GlRenderTargetPool,
    /// Per-frame velocity G-buffer fed into velocity-driven effects (motion
    /// blur, TAA).  `None` when no velocity pass ran.
    pub velocity_texture: Option<glow::Texture>,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Begins an effect-pipeline frame: ensures the scene target is sized to the
/// current canvas and makes it the active draw target.
///
/// Mirrors the TS pipeline: the scene render loop clears and draws into the
/// bound target; `begin` only redirects rendering into it.
pub fn begin_gl_render_effect_pipeline(
    state: &mut GlRenderState,
    pipeline: &mut GlRenderEffectPipeline,
) {
    let runtime = flighthq_render_gl::get_gl_render_state_runtime(state);
    let w = runtime.default_viewport_width.max(1);
    let h = runtime.default_viewport_height.max(1);
    let format = pipeline.options.format.unwrap_or_default();
    let sample_count = pipeline.options.sample_count.unwrap_or(1).max(1);

    match pipeline.scene_target.as_mut() {
        None => {
            pipeline.scene_target =
                Some(create_gl_render_target(state, w, h, format, sample_count));
        }
        Some(target) => {
            if target.width != w || target.height != h {
                resize_gl_render_target(state, target, w, h);
            }
        }
    }

    let render_transform = state.render_state.render_transform_2d.unwrap_or_default();
    // Borrow-split: begin reads the target while mutating state's runtime. The
    // target lives in the pipeline (disjoint from state), so a raw read is safe.
    let scene_ptr: *const GlRenderTarget = pipeline
        .scene_target
        .as_ref()
        .expect("scene target ensured");
    // SAFETY: scene_ptr points at the pipeline-owned target, distinct from state.
    let scene_target = unsafe { &*scene_ptr };
    begin_gl_render_target(state, scene_target, &render_transform);
}

/// Creates a new [`GlRenderEffectPipeline`] with the given options.
pub fn create_gl_render_effect_pipeline(
    _state: &GlRenderState,
    options: GlRenderEffectPipelineOptions,
) -> GlRenderEffectPipeline {
    GlRenderEffectPipeline {
        options,
        scene_target: None,
        pool: create_gl_render_target_pool(),
        velocity_texture: None,
    }
}

/// Destroys the pipeline and all GL resources it owns.
pub fn destroy_gl_render_effect_pipeline(
    state: &mut GlRenderState,
    mut pipeline: GlRenderEffectPipeline,
) {
    if let Some(target) = pipeline.scene_target.take() {
        destroy_gl_render_target(state, target);
    }
    destroy_gl_render_target_pool(state, pipeline.pool);
}

/// Ends an effect-pipeline frame: pops the scene target, resolves MSAA, runs
/// `effects` through the per-state registry ping-ponging pooled targets, and
/// blits the result to the canvas.
pub fn end_gl_render_effect_pipeline(
    state: &mut GlRenderState,
    pipeline: &mut GlRenderEffectPipeline,
    effects: &[RenderEffect],
) {
    if pipeline.scene_target.is_none() {
        return;
    }

    // Pop the scene render target; restores the canvas framebuffer/viewport.
    end_gl_render_target(state);

    let (w, h, format, depth_texture) = {
        let scene = pipeline.scene_target.as_ref().unwrap();
        (scene.width, scene.height, scene.format, scene.depth_texture)
    };

    // Resolve MSAA into the scene target's single-sample resolve texture so the
    // effect passes sample resolved color. No-op for sample_count == 1.
    {
        let scene_ptr: *const GlRenderTarget = pipeline.scene_target.as_ref().unwrap();
        // SAFETY: scene_ptr is the pipeline-owned target, distinct from state.
        let scene = unsafe { &*scene_ptr };
        resolve_gl_render_target(state, scene);
    }

    // Ping-pong the scene through two pooled scratch targets, acquired lazily on
    // the first effect that runs. `source` starts at the scene target and
    // alternates to whichever scratch was just written.
    let mut scratch_a: Option<u64> = None;
    let mut scratch_b: Option<u64> = None;
    // `source` is a raw pointer to the live read target for the next pass.
    let mut source: *const GlRenderTarget = pipeline.scene_target.as_ref().unwrap();

    for effect in effects {
        let effect_type = gl_render_effect_type(effect);
        let Some(runner) = get_gl_render_effect_runner(state, effect_type) else {
            continue;
        };
        if scratch_a.is_none() {
            scratch_a = Some(acquire_gl_render_target(
                state,
                &mut pipeline.pool,
                w,
                h,
                format,
            ));
        }
        if scratch_b.is_none() {
            scratch_b = Some(acquire_gl_render_target(
                state,
                &mut pipeline.pool,
                w,
                h,
                format,
            ));
        }
        let id_a = scratch_a.unwrap();
        let id_b = scratch_b.unwrap();
        let a_ptr: *const GlRenderTarget =
            get_gl_render_target(&pipeline.pool, id_a).expect("scratch a");
        let b_ptr: *const GlRenderTarget =
            get_gl_render_target(&pipeline.pool, id_b).expect("scratch b");
        // The destination is whichever scratch is not currently the source.
        let dest: *const GlRenderTarget = if std::ptr::eq(source, a_ptr) {
            b_ptr
        } else {
            a_ptr
        };

        let pool_ptr: *mut GlRenderTargetPool = &mut pipeline.pool;
        let state_ptr: *mut GlRenderState = state;
        // SAFETY: `state`, `source`/`dest` (pooled or scene targets owned by the
        // pipeline), and `pool` are mutually disjoint allocations live for the
        // duration of the runner call. The pool's `Vec` is not reallocated while
        // the runner holds `source`/`dest`, because the two scratch entries were
        // already pushed before this borrow and any intermediate target the
        // runner acquires only appends; existing boxed targets are addressed via
        // their heap framebuffer/texture handles, not moved.
        let ctx = GlRenderEffectContext {
            state: unsafe { &mut *state_ptr },
            source: unsafe { &*source },
            dest: unsafe { &*dest },
            pool: unsafe { &mut *pool_ptr },
            // Depth G-buffer comes from the scene target when present.
            scene_depth_texture: depth_texture,
            scene_velocity_texture: pipeline.velocity_texture,
        };
        runner(&ctx, effect);
        source = dest;
    }

    // Present the final result (the scene target when no effect ran).
    // SAFETY: `source` points at a live target (scene or scratch) owned by the
    // pipeline, distinct from state.
    let final_source = unsafe { &*source };
    present_gl_render_effect_result(state, final_source);

    if let Some(id) = scratch_a.take() {
        release_gl_render_target(&mut pipeline.pool, id);
    }
    if let Some(id) = scratch_b.take() {
        release_gl_render_target(&mut pipeline.pool, id);
    }
}

/// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects
/// this frame.  Pass `None` to clear it.
pub fn set_gl_render_effect_velocity_texture(
    pipeline: &mut GlRenderEffectPipeline,
    texture: Option<glow::Texture>,
) {
    pipeline.velocity_texture = texture;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Blits the final effect result to the canvas (GL→GL, no orientation flip). The
// present program is compiled once per state and reused.
fn present_gl_render_effect_result(state: &mut GlRenderState, source: &GlRenderTarget) {
    let texture = source.texture;
    let program = get_gl_effect_program(state, "effect.present", PRESENT_FRAGMENT_SRC);
    // Borrow-split: `program` lives in the per-state cache (stable while `state`
    // is borrowed); the draw needs `&state` again. Re-borrow through a pointer.
    let program_ptr: *const _ = program;
    // SAFETY: the cached program box is not moved or freed during this borrow.
    let program = unsafe { &*program_ptr };
    draw_gl_effect_fullscreen_pass(state, program, &[texture], None, |_, _| {});
}

const PRESENT_FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}";

#[cfg(test)]
mod tests {
    use super::*;

    // PRESENT_FRAGMENT_SRC

    #[test]
    fn present_fragment_src_is_a_passthrough_blit() {
        assert!(PRESENT_FRAGMENT_SRC.contains("#version 300 es"));
        assert!(PRESENT_FRAGMENT_SRC.contains("uniform sampler2D u_texture0"));
        assert!(PRESENT_FRAGMENT_SRC.contains("texture(u_texture0, v_texCoord)"));
    }
}
