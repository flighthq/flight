//! Opt-in WGPU post-process effect pipeline.
//!
//! The scene renders into the pipeline's (optionally HDR) target between
//! [`begin_wgpu_render_effect_pipeline`] and [`end_wgpu_render_effect_pipeline`];
//! `end` runs the agnostic effect list through the per-state registry
//! ping-ponging pooled targets, then presents the result to the canvas.
//!
//! The per-frame effect list is plain data; only the scene target and pool are
//! retained in the pipeline struct.  The default render loop imports none of
//! this.  Mirrors `flighthq-effects-gl`'s `render_effect_pipeline` and the TS
//! `renderEffectPipeline` from `effects-webgpu`.
//!
//! Depth/velocity G-buffers are not yet produced for WGPU; depth- and
//! velocity-driven recipes receive `None` and fall back to their color-only
//! paths.

use flighthq_effects::RenderEffect;
use flighthq_render_wgpu::render_state::{
    WgpuRenderState, WgpuRenderTarget, get_wgpu_render_state_runtime,
};
use flighthq_render_wgpu::render_target::{
    begin_wgpu_render_target, create_wgpu_render_target, destroy_wgpu_render_target,
    end_wgpu_render_target, resize_wgpu_render_target,
};
use flighthq_render_wgpu::render_target_pool::{
    WgpuRenderTargetPool, acquire_wgpu_render_target, create_wgpu_render_target_pool,
    destroy_wgpu_render_target_pool, release_wgpu_render_target,
};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_effect_filter_pass, get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{
    WgpuRenderEffectContext, get_wgpu_render_effect_runner, wgpu_render_effect_type,
};

/// Depth attachment mode for the pipeline scene target.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum WgpuPipelineDepth {
    /// No depth attachment.
    #[default]
    None,
    /// Depth/stencil texture (write-only; not sampleable as a recipe input).
    DepthStencil,
    /// Sampleable depth texture (enables depth-driven effects like SSAO, DoF,
    /// screen-space fog).
    DepthStencilSampled,
}

/// Options for creating a [`WgpuRenderEffectPipeline`].
///
/// Format is a `wgpu::TextureFormat` directly (use an `Rgba16Float` format for
/// HDR bloom / tone-mapping headroom).
#[derive(Clone, Debug, Default)]
pub struct WgpuRenderEffectPipelineOptions {
    /// MSAA sample count on the scene target.  Default 1.
    pub sample_count: Option<u32>,
    /// Color format of the scene target.  Use a float format for HDR bloom /
    /// tone-mapping.  Default the canvas format.
    pub format: Option<wgpu::TextureFormat>,
    /// Depth attachment for depth-driven effects (SSAO, DoF, fog).
    pub depth: Option<WgpuPipelineDepth>,
}

/// Retains the GPU resources an effect pass needs across frames.
///
/// The per-frame effect list is data passed to
/// [`end_wgpu_render_effect_pipeline`], not stored here.  Mirrors
/// `GlRenderEffectPipeline`.
pub struct WgpuRenderEffectPipeline {
    pub options: WgpuRenderEffectPipelineOptions,
    /// The off-screen scene target; `None` until the first frame.
    pub scene_target: Option<WgpuRenderTarget>,
    /// Intermediate-target pool for multi-pass recipes.
    pub pool: WgpuRenderTargetPool,
    /// Per-frame velocity G-buffer fed into velocity-driven effects (motion
    /// blur, TAA).  `None` when no velocity pass ran.
    pub velocity_texture: Option<wgpu::Texture>,
}

/// Begins an effect-pipeline frame: ensures the scene target is sized to the
/// current canvas and makes it the active draw target.
///
/// The scene target is cleared to the background color so the background is part
/// of the image the effects process and the replace-blend present composites,
/// mirroring the WebGL pipeline.
pub fn begin_wgpu_render_effect_pipeline(
    state: &mut WgpuRenderState,
    pipeline: &mut WgpuRenderEffectPipeline,
) {
    let w = state.surface_width.max(1);
    let h = state.surface_height.max(1);
    let format = pipeline.options.format.unwrap_or(state.format);

    match pipeline.scene_target.as_mut() {
        None => {
            pipeline.scene_target = Some(create_wgpu_render_target(state, w, h, Some(format)));
        }
        Some(target) => {
            resize_wgpu_render_target(state, target, w, h);
        }
    }

    let clear_color = unpack_wgpu_clear_color(state.render_state.background_color);
    let render_transform = state.render_state.render_transform_2d.unwrap_or_default();
    let scene_target = pipeline
        .scene_target
        .as_ref()
        .expect("scene target ensured");
    // Borrow-split: begin reads the target while mutating state's runtime. The
    // target lives in the pipeline (disjoint from state), so a raw read is safe.
    let scene_ptr: *const WgpuRenderTarget = scene_target;
    // SAFETY: scene_ptr points at the pipeline-owned target, distinct from state.
    let scene_target = unsafe { &*scene_ptr };
    begin_wgpu_render_target(state, scene_target, &render_transform, clear_color);
}

/// Creates a new [`WgpuRenderEffectPipeline`] with the given options.
pub fn create_wgpu_render_effect_pipeline(
    _state: &WgpuRenderState,
    options: WgpuRenderEffectPipelineOptions,
) -> WgpuRenderEffectPipeline {
    WgpuRenderEffectPipeline {
        options,
        scene_target: None,
        pool: create_wgpu_render_target_pool(),
        velocity_texture: None,
    }
}

/// Destroys the pipeline and all WGPU resources it owns.
pub fn destroy_wgpu_render_effect_pipeline(
    state: &mut WgpuRenderState,
    mut pipeline: WgpuRenderEffectPipeline,
) {
    if let Some(target) = pipeline.scene_target.take() {
        destroy_wgpu_render_target(state, target);
    }
    if let Some(texture) = pipeline.velocity_texture.take() {
        texture.destroy();
    }
    destroy_wgpu_render_target_pool(state, pipeline.pool);
}

/// Ends an effect-pipeline frame: pops the scene target, runs `effects` through
/// the per-state registry ping-ponging pooled targets, and presents the result
/// to the canvas.
pub fn end_wgpu_render_effect_pipeline(
    state: &mut WgpuRenderState,
    pipeline: &mut WgpuRenderEffectPipeline,
    effects: &[RenderEffect],
) {
    if pipeline.scene_target.is_none() {
        return;
    }

    // Pop the scene render target; restores the canvas pass (load op).
    end_wgpu_render_target(state);

    let (w, h, format) = {
        let scene = pipeline.scene_target.as_ref().unwrap();
        (scene.width, scene.height, scene.format)
    };

    // Ping-pong the scene through two pooled scratch targets. `source` starts at
    // the scene target and alternates between the two scratch targets per effect.
    let mut scratch_a: Option<WgpuRenderTarget> = None;
    let mut scratch_b: Option<WgpuRenderTarget> = None;
    // `current` is the raw pointer to the live source for the next pass; it starts
    // at the scene target and is updated to whichever scratch was written.
    let mut current: *const WgpuRenderTarget = pipeline.scene_target.as_ref().unwrap();

    for effect in effects {
        let effect_type = wgpu_render_effect_type(effect);
        let Some(runner) = get_wgpu_render_effect_runner(state, effect_type) else {
            continue;
        };
        if scratch_a.is_none() {
            scratch_a = Some(acquire_wgpu_render_target(
                state,
                &mut pipeline.pool,
                w,
                h,
                Some(format),
            ));
        }
        if scratch_b.is_none() {
            scratch_b = Some(acquire_wgpu_render_target(
                state,
                &mut pipeline.pool,
                w,
                h,
                Some(format),
            ));
        }
        let a_ptr: *const WgpuRenderTarget = scratch_a.as_ref().unwrap();
        let b_ptr: *const WgpuRenderTarget = scratch_b.as_ref().unwrap();
        // The destination is whichever scratch is not currently the source.
        let dest: *const WgpuRenderTarget = if std::ptr::eq(current, a_ptr) {
            b_ptr
        } else {
            a_ptr
        };

        let velocity_view = pipeline
            .velocity_texture
            .as_ref()
            .map(|t| t.create_view(&wgpu::TextureViewDescriptor::default()));

        let mut ctx = WgpuRenderEffectContext {
            state,
            source: current,
            dest,
            pool: &mut pipeline.pool,
            // Depth G-buffer not produced for WGPU yet; recipes fall back to color-only.
            scene_depth_texture: None,
            scene_velocity_texture: velocity_view,
        };
        runner(&mut ctx, effect);
        current = dest;
    }

    // Present the final result (the scene target when no effect ran).
    // SAFETY: `current` points at a live target (scene or scratch) owned by the
    // pipeline, distinct from state.
    let final_source = unsafe { &*current };
    present_wgpu_render_effect_result(state, final_source);

    if let Some(target) = scratch_a.take() {
        release_wgpu_render_target(&mut pipeline.pool, target);
    }
    if let Some(target) = scratch_b.take() {
        release_wgpu_render_target(&mut pipeline.pool, target);
    }
}

/// Sets the velocity G-buffer the pipeline feeds to velocity-driven effects
/// this frame.  Pass `None` to clear it.
pub fn set_wgpu_render_effect_velocity_texture(
    pipeline: &mut WgpuRenderEffectPipeline,
    texture: Option<wgpu::Texture>,
) {
    pipeline.velocity_texture = texture;
}

// Presents the final effect result to the canvas: draws `source` into the
// canvas color attachment (dest = None) with replace blend so it overwrites the
// canvas pixels. No-op when the frame has no command encoder.
fn present_wgpu_render_effect_result(state: &mut WgpuRenderState, source: &WgpuRenderTarget) {
    if get_wgpu_render_state_runtime(state)
        .command_encoder
        .is_none()
    {
        return;
    }
    get_wgpu_effect_pipeline(
        state,
        "effect.present",
        PRESENT_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "effect.present", source, None, |_, _| {});
}

// Unpacks a packed RGBA u32 (0xRRGGBBaa) into a wgpu clear color (0..1 floats).
// The scene target always clears to the background color so the background is
// part of the image the effects process and the replace-blend present
// composites, mirroring the WebGL pipeline.
fn unpack_wgpu_clear_color(packed: u32) -> Option<wgpu::Color> {
    Some(wgpu::Color {
        r: ((packed >> 24) & 0xff) as f64 / 255.0,
        g: ((packed >> 16) & 0xff) as f64 / 255.0,
        b: ((packed >> 8) & 0xff) as f64 / 255.0,
        a: (packed & 0xff) as f64 / 255.0,
    })
}

const PRESENT_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unpack_wgpu_clear_color_unpacks_packed_rgba() {
        let color = unpack_wgpu_clear_color(0xff8000ff).unwrap();
        assert!((color.r - 1.0).abs() < 1e-9);
        assert!((color.g - 0.5019607843).abs() < 1e-6);
        assert!((color.b - 0.0).abs() < 1e-9);
        assert!((color.a - 1.0).abs() < 1e-9);
    }

    #[test]
    fn unpack_wgpu_clear_color_alpha_zero_is_transparent() {
        let color = unpack_wgpu_clear_color(0x00000000).unwrap();
        assert_eq!(color.a, 0.0);
    }

    #[test]
    fn present_fragment_is_a_passthrough_blit() {
        use crate::effect_program_cache::build_wgpu_effect_module_wgsl;
        let module = build_wgpu_effect_module_wgsl(PRESENT_FRAGMENT_WGSL);
        assert!(module.contains("textureSampleLevel(tex, smp, uv, 0.0)"));
        assert!(module.contains("fn vs_main"));
    }
}
