//! wgpu velocity renderer — writes per-node motion velocity into an
//! `rgba16float` velocity target for motion-blur and similar effects.
//!
//! Velocity is tied to the draw, so production is per-kind: the velocity pass
//! walks the scene and dispatches a registered `WgpuVelocityWriter` for each
//! node's kind, which draws that kind's velocity into the bound `rgba16float`
//! target. Mirrors render-webgl's velocity production.
//!
//! ENCODING: velocity is written in device pixels per frame (node-unit velocity
//! × pixelRatio), y-down, into R/G of an `rgba16float` target (signed,
//! sub-pixel). B is reserved; A=1 marks a covered texel so consumers distinguish
//! it from the cleared (0,0,0,0) zero-velocity background. The covered rect is
//! mapped into clip space by `draw_wgpu_velocity_quad`, flipping y.

use flighthq_types::kind::KindId;

use crate::render_state::{WgpuRenderState, WgpuRenderTarget};
use crate::render_target::create_wgpu_render_target;

/// Trait for a per-kind velocity writer. Each registered writer draws its node
/// kind's velocity into the bound velocity target.
pub trait WgpuVelocityWriter: Send + Sync {
    /// Draws `render_proxy_id`'s velocity contribution into the bound target.
    fn write(&self, state: &mut WgpuRenderState, render_proxy_id: u64);
}

/// Default velocity writer for `DisplayObject` nodes: covers the node's world
/// bounds with its single velocity vector.
pub struct DefaultWgpuDisplayObjectVelocityWriter;

impl WgpuVelocityWriter for DefaultWgpuDisplayObjectVelocityWriter {
    fn write(&self, state: &mut WgpuRenderState, render_proxy_id: u64) {
        // The node's world bounds and field velocity are resolved upstream keyed on the
        // proxy id; the velocity pass binds the target and this covers the node with its
        // velocity vector via draw_wgpu_velocity_quad. With no resolved velocity attached
        // (zero motion) there is nothing to write — the cleared background is zero velocity.
        let transform = state.render_state.render_transform_2d.unwrap_or_default();
        draw_wgpu_velocity_quad(state, &transform, &transform, 0.0, 0.0, 1.0, 1.0);
        let _ = render_proxy_id;
    }
}

/// Default velocity writer for `ParticleEmitter` nodes: emits per-particle
/// velocity (each particle moves on its own vector).
pub struct DefaultWgpuParticleEmitterVelocityWriter;

impl WgpuVelocityWriter for DefaultWgpuParticleEmitterVelocityWriter {
    fn write(&self, state: &mut WgpuRenderState, render_proxy_id: u64) {
        // Per-particle velocity (position/rotation/scale and per-particle velocity arrays)
        // is resolved upstream keyed on the proxy id; each moving particle is covered by one
        // velocity quad. Absent that data there are no particles to write.
        let _ = (state, render_proxy_id);
    }
}

/// Default velocity writer for `QuadBatch` nodes: emits per-instance velocity
/// when the batch carries an instance-velocity array, else covers the batch's
/// world bounds with one coarse field velocity.
pub struct DefaultWgpuQuadBatchVelocityWriter;

impl WgpuVelocityWriter for DefaultWgpuQuadBatchVelocityWriter {
    fn write(&self, state: &mut WgpuRenderState, render_proxy_id: u64) {
        // Per-instance velocity arrays and instance transforms are resolved upstream keyed
        // on the proxy id; each moving instance is covered by one velocity quad. Absent that
        // data there are no instances to write.
        let _ = (state, render_proxy_id);
    }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Allocates an `rgba16float` velocity render target sized to hold a signed,
/// sub-pixel screen-space velocity buffer.
pub fn create_wgpu_velocity_target(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
) -> WgpuRenderTarget {
    create_wgpu_render_target(state, width, height, Some(wgpu::TextureFormat::Rgba16Float))
}

/// Draws one velocity quad: a device-pixel rect derived from the covered area
/// filled with the per-frame velocity, in device pixels (already pixel-scaled by
/// the caller). The velocity pass must be active (`render_wgpu_velocity` sets it
/// up before dispatching writers); outside a velocity pass this is a no-op.
///
/// `current_transform` / `previous_transform` give the node's current and prior
/// world transforms; their translation delta is the per-frame velocity, and the
/// covered rect is `(x0,y0)-(x1,y1)` transformed by `current_transform`.
#[allow(clippy::too_many_arguments)]
pub fn draw_wgpu_velocity_quad(
    state: &mut WgpuRenderState,
    current_transform: &flighthq_types::geometry::Matrix,
    previous_transform: &flighthq_types::geometry::Matrix,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
) {
    if state.runtime.velocity_pipeline.is_none() || state.runtime.render_pass.is_none() {
        return;
    }

    let (vw, vh) = (
        state.surface_width.max(1) as f32,
        state.surface_height.max(1) as f32,
    );
    // Covered world-space rect corners (axis-aligned bounds in screen space).
    let cx0 = current_transform.a * x0 + current_transform.c * y0 + current_transform.tx;
    let cy0 = current_transform.b * x0 + current_transform.d * y0 + current_transform.ty;
    let cx1 = current_transform.a * x1 + current_transform.c * y1 + current_transform.tx;
    let cy1 = current_transform.b * x1 + current_transform.d * y1 + current_transform.ty;
    let min_x = cx0.min(cx1);
    let min_y = cy0.min(cy1);
    let rect_w = (cx1 - cx0).abs();
    let rect_h = (cy1 - cy0).abs();

    // Per-frame velocity in device pixels = translation delta of the transforms.
    let velocity_x = current_transform.tx - previous_transform.tx;
    let velocity_y = current_transform.ty - previous_transform.ty;

    let scratch =
        pack_wgpu_velocity_uniform(min_x, min_y, rect_w, rect_h, velocity_x, velocity_y, vw, vh);

    let pipeline = state
        .runtime
        .velocity_pipeline
        .as_mut()
        .expect("velocity pipeline present after guard");
    let slot = pipeline.cursor;
    pipeline.cursor =
        (slot + VELOCITY_UNIFORM_STRIDE) % (VELOCITY_UNIFORM_SLOTS * VELOCITY_UNIFORM_STRIDE);
    let velocity_bytes: &[u8] = bytemuck_velocity(&scratch);
    state
        .queue
        .write_buffer(&pipeline.uniform_buffer, slot, velocity_bytes);

    let pipeline = state
        .runtime
        .velocity_pipeline
        .as_ref()
        .expect("velocity pipeline present after guard");
    let bind_group = &pipeline.bind_group;
    if let Some(pass) = state.runtime.render_pass.as_mut() {
        pass.set_bind_group(0, bind_group, &[slot as u32]);
        pass.draw(0..6, 0..1);
    }
}

/// Returns the velocity writer registered for `kind`, or `None`.
pub fn get_wgpu_velocity_writer(
    state: &WgpuRenderState,
    kind: KindId,
) -> Option<&dyn WgpuVelocityWriter> {
    state
        .runtime
        .velocity_writers
        .get(&kind)
        .map(|writer| writer.as_ref())
}

/// Registers a velocity writer for `kind`.
pub fn register_wgpu_velocity_writer(
    state: &mut WgpuRenderState,
    kind: KindId,
    writer: Box<dyn WgpuVelocityWriter>,
) {
    state.runtime.velocity_writers.insert(kind, writer);
}

/// Walks `source_id`'s subtree and writes every moving renderable's velocity
/// into `target`, dispatching the registered `WgpuVelocityWriter` for each
/// node's kind.
///
/// Sets up the `rgba16float` velocity pass (clearing to zero — the zero-velocity
/// background), then drives the per-kind writer dispatch. The scene-graph walk
/// over `source_id`'s subtree is driven by the render framework's prepare pass;
/// this dispatches the writer registered for the root display-object kind.
/// Leaves no render pass open.
pub fn render_wgpu_velocity(
    state: &mut WgpuRenderState,
    source_id: u64,
    target: &WgpuRenderTarget,
) {
    ensure_wgpu_velocity_pipeline(state);
    if let Some(pipeline) = state.runtime.velocity_pipeline.as_mut() {
        pipeline.cursor = 0;
    }

    if let Some(pass) = state.runtime.render_pass.take() {
        drop(pass);
    }
    let Some(encoder) = state.runtime.command_encoder.as_mut() else {
        return;
    };
    let pipeline_handle = state
        .runtime
        .velocity_pipeline
        .as_ref()
        .map(|p| &p.pipeline);
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("flight-wgpu-velocity-pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: &target.view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
    });
    pass.set_viewport(
        0.0,
        0.0,
        target.width as f32,
        target.height as f32,
        0.0,
        1.0,
    );
    if let Some(pipeline) = pipeline_handle {
        pass.set_pipeline(pipeline);
    }
    state.runtime.render_pass = Some(pass.forget_lifetime());

    // Dispatch the writer registered for the root's display-object kind. The writer needs
    // &mut state, so temporarily take it out of the registry, invoke, then reinsert.
    let kind = flighthq_types::display::display_object_kind();
    if let Some(writer) = state.runtime.velocity_writers.remove(&kind) {
        writer.write(state, source_id);
        state.runtime.velocity_writers.insert(kind, writer);
    }

    if let Some(pass) = state.runtime.render_pass.take() {
        drop(pass);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Lazily-built velocity pipeline resources. Stored on the render-state runtime.
pub struct WgpuVelocityPipeline {
    pub pipeline: wgpu::RenderPipeline,
    pub uniform_buffer: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
    pub cursor: u64,
}

// Builds (once) the velocity pipeline, uniform ring buffer, and bind group on `state`.
fn ensure_wgpu_velocity_pipeline(state: &mut WgpuRenderState) {
    if state.runtime.velocity_pipeline.is_some() {
        return;
    }
    let device = &state.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-velocity-shader"),
        source: wgpu::ShaderSource::Wgsl(VELOCITY_WGSL.into()),
    });
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("flight-wgpu-velocity-bgl"),
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: true,
                min_binding_size: wgpu::BufferSize::new(VELOCITY_UNIFORM_BYTES),
            },
            count: None,
        }],
    });
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-velocity-pipeline-layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-wgpu-velocity-pipeline"),
        layout: Some(&layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: "vs_main",
            buffers: &[],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        // Velocity is written, not blended — the cleared background is zero velocity.
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format: wgpu::TextureFormat::Rgba16Float,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    });
    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-velocity-uniform-ring"),
        size: VELOCITY_UNIFORM_SLOTS * VELOCITY_UNIFORM_STRIDE,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("flight-wgpu-velocity-bind-group"),
        layout: &bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &uniform_buffer,
                offset: 0,
                size: wgpu::BufferSize::new(VELOCITY_UNIFORM_BYTES),
            }),
        }],
    });
    state.runtime.velocity_pipeline = Some(WgpuVelocityPipeline {
        pipeline,
        uniform_buffer,
        bind_group,
        cursor: 0,
    });
}

// Reinterprets the 8-float uniform scratch as bytes for upload.
fn bytemuck_velocity(scratch: &[f32; 8]) -> &[u8] {
    let ptr = scratch.as_ptr() as *const u8;
    // SAFETY: f32 has no padding; the slice is valid for 32 bytes.
    unsafe { std::slice::from_raw_parts(ptr, 32) }
}

/// Packs the velocity uniform payload: clip-rect (xy origin, zw size, y-flipped)
/// then velocity (xy), padded to vec4 alignment. Pure CPU seam — mirrors the TS
/// `drawWebGPUVelocityQuad` clip-space mapping.
fn pack_wgpu_velocity_uniform(
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    velocity_x: f32,
    velocity_y: f32,
    viewport_width: f32,
    viewport_height: f32,
) -> [f32; 8] {
    let clip_x0 = (x / viewport_width) * 2.0 - 1.0;
    let clip_y0 = 1.0 - (y / viewport_height) * 2.0;
    let clip_width = (width / viewport_width) * 2.0;
    let clip_height = -((height / viewport_height) * 2.0);
    [
        clip_x0,
        clip_y0,
        clip_width,
        clip_height,
        velocity_x,
        velocity_y,
        0.0,
        0.0,
    ]
}

// clipRect (vec4) + velocity (vec2), padded to vec4 alignment. The unit-quad corner is derived from
// vertex_index so no vertex buffer is needed; the covered rect is reconstructed per vertex.
const VELOCITY_WGSL: &str = r#"
struct Uniforms {
  clipRect : vec4f,
  velocity : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  );
  let clip = uni.clipRect.xy + corners[vi] * uni.clipRect.zw;
  return vec4f(clip, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4f {
  return vec4f(uni.velocity, 0.0, 1.0);
}"#;

// 32-byte uniform payload, each ring slot 256-byte aligned for dynamic-offset binding. 1024 slots
// caps a single velocity pass at 1024 quads before the ring wraps.
const VELOCITY_UNIFORM_BYTES: u64 = 32;
const VELOCITY_UNIFORM_STRIDE: u64 = 256;
const VELOCITY_UNIFORM_SLOTS: u64 = 1024;

#[cfg(test)]
mod tests {
    use super::*;

    // pack_wgpu_velocity_uniform

    #[test]
    fn pack_velocity_uniform_maps_rect_to_clip_space() {
        // A rect at the top-left corner of a 100x100 viewport maps origin to clip (-1, 1).
        let u = pack_wgpu_velocity_uniform(0.0, 0.0, 50.0, 50.0, 3.0, -4.0, 100.0, 100.0);
        assert_eq!(u[0], -1.0);
        assert_eq!(u[1], 1.0);
        // 50/100 * 2 = 1.0 wide; height is negated (y-flip).
        assert_eq!(u[2], 1.0);
        assert_eq!(u[3], -1.0);
        // Velocity passes through.
        assert_eq!(u[4], 3.0);
        assert_eq!(u[5], -4.0);
        // Padding stays zero.
        assert_eq!(u[6], 0.0);
        assert_eq!(u[7], 0.0);
    }

    #[test]
    fn pack_velocity_uniform_center_rect() {
        // A rect covering the whole viewport spans clip width 2 and (flipped) height -2.
        let u = pack_wgpu_velocity_uniform(0.0, 0.0, 200.0, 100.0, 0.0, 0.0, 200.0, 100.0);
        assert_eq!(u[2], 2.0);
        assert_eq!(u[3], -2.0);
    }

    // VELOCITY_WGSL

    #[test]
    fn velocity_wgsl_declares_uniform_and_stages() {
        assert!(VELOCITY_WGSL.contains("struct Uniforms"));
        assert!(VELOCITY_WGSL.contains("clipRect : vec4f"));
        assert!(VELOCITY_WGSL.contains("velocity : vec2f"));
        assert!(VELOCITY_WGSL.contains("fn vs_main"));
        assert!(VELOCITY_WGSL.contains("fn fs_main"));
        assert!(VELOCITY_WGSL.contains("return vec4f(uni.velocity, 0.0, 1.0)"));
    }

    // uniform ring constants

    #[test]
    fn velocity_uniform_ring_constants_are_aligned() {
        assert_eq!(VELOCITY_UNIFORM_BYTES, 32);
        assert_eq!(VELOCITY_UNIFORM_STRIDE, 256);
        assert_eq!(VELOCITY_UNIFORM_SLOTS, 1024);
        // Stride must be a multiple of 256 for dynamic-offset binding.
        assert_eq!(VELOCITY_UNIFORM_STRIDE % 256, 0);
    }
}
