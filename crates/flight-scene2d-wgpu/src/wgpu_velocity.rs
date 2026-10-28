// flight-lint: allow-file(contract-vocabulary) D17 velocity production records native wgpu passes over render-wgpu state
//! Velocity-buffer production on the WebGPU backend (TS `wgpuVelocity.ts`), the mirror of the GL
//! velocity pass. Velocity is tied to the draw, so production is per kind: the velocity pass walks
//! the scene and dispatches a registered `WgpuVelocityWriter` for each node's kind, which draws that
//! kind's velocity into the bound rgba16float target. The velocity DATA comes from a render-agnostic
//! `VelocityField`; this module is only the render-side hook.
//!
//! ENCODING: velocity is written in device pixels per frame (node-unit velocity × pixel ratio),
//! y-down, into R/G of an rgba16float target. B is reserved; A=1 marks a covered texel so consumers
//! distinguish it from the cleared (0,0,0,0) zero-velocity background.

use std::sync::Arc;

use flight_entity::{Kind, get_entity_id, throw_error};
use flight_node::{
    NodeRef, get_node_child_at, get_node_child_count, get_node_world_bounds_rectangle,
    get_node_world_matrix,
};
use flight_particleemitter::ParticleEmitter2D;
use flight_quadbatch::{QuadBatch, QuadTransformType, get_quad_batch_runtime};
use flight_registry::with_kind_map_entry;
use flight_render::RenderState;
use flight_render_wgpu::{
    WgpuRenderState, WgpuTextureRenderTarget, WgpuVelocityContext, WgpuVelocityWriter,
    create_wgpu_texture_render_target, get_wgpu_active_render_pass,
    get_wgpu_active_render_pass_handle, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut, resume_wgpu_render_pass,
    suspend_wgpu_render_pass, write_wgpu_buffer,
};
use flight_textureatlas::TextureAtlasRotation;
use flight_velocity::{Velocity2D, VelocityField, get_velocity};

use crate::scene2d_wgpu_runtime::{ensure_scene2d_wgpu_runtime, get_scene2d_wgpu_runtime_mut};
use crate::types::*;
use crate::wgpu_quad_batch_writer::wgpu_f32_bytes;

// clipRect (vec4) + velocity (vec2), padded to vec4 alignment. The unit-quad corner is derived from
// vertex_index, so no vertex buffer is needed; the covered rect is reconstructed per vertex.
const VELOCITY_WGSL: &str = r"
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
}";

// A 32-byte uniform payload, with each ring slot 256-byte aligned for dynamic-offset binding. 1024
// slots cap one velocity pass at 1024 quads before the ring wraps.
const UNIFORM_BYTES: u32 = 32;
const UNIFORM_STRIDE: u32 = 256;
const UNIFORM_SLOTS: u32 = 1024;

/// Allocates an rgba16float target sized to hold a signed, sub-pixel screen-space velocity buffer
/// (TS `createWgpuVelocityTarget`).
pub fn create_wgpu_velocity_target(
    state: &WgpuRenderState,
    width: f32,
    height: f32,
) -> WgpuTextureRenderTarget {
    return create_wgpu_texture_render_target(
        state,
        width,
        height,
        Some(wgpu::TextureFormat::Rgba16Float),
        None,
        None,
    );
}

/// Draws one velocity quad: a device-pixel rect filled with (velocity_x, velocity_y) in node units,
/// scaled by the pixel ratio here (TS `drawWgpuVelocityQuad`). A no-op outside a velocity pass. Each
/// draw consumes one uniform ring slot addressed by dynamic offset.
pub fn draw_wgpu_velocity_quad(
    ctx: &mut WgpuVelocityContext<'_>,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    velocity_x: f32,
    velocity_y: f32,
) {
    let (ctx_width, ctx_height, pixel_ratio) = (ctx.width, ctx.height, ctx.pixel_ratio);
    let native = get_wgpu_render_state_native_device(ctx.state);
    let Some(runtime) = get_scene2d_wgpu_runtime_mut(ctx.state) else {
        return;
    };
    if runtime.velocity_pass.is_none() {
        return;
    }
    let Some(pipeline) = runtime.velocity_pipeline.as_mut() else {
        return;
    };

    let clip_x0 = (x / ctx_width) * 2.0 - 1.0;
    let clip_y0 = 1.0 - (y / ctx_height) * 2.0;
    let clip_width = (width / ctx_width) * 2.0;
    let clip_height = -((height / ctx_height) * 2.0);

    let slot = pipeline.cursor;
    pipeline.cursor = (slot + UNIFORM_STRIDE) % (UNIFORM_SLOTS * UNIFORM_STRIDE);
    let scratch = &mut pipeline.scratch;
    scratch[0] = clip_x0;
    scratch[1] = clip_y0;
    scratch[2] = clip_width;
    scratch[3] = clip_height;
    scratch[4] = velocity_x * pixel_ratio;
    scratch[5] = velocity_y * pixel_ratio;
    write_wgpu_buffer(
        &native,
        &pipeline.uniform_buffer,
        slot as u64,
        &wgpu_f32_bytes(scratch)[..UNIFORM_BYTES as usize],
    );

    let bind_group = pipeline.bind_group.clone();
    let pass = runtime.velocity_pass.as_mut().unwrap();
    pass.set_bind_group(0, &bind_group, &[slot]);
    pass.draw(0..6, 0..1);
}

fn ensure_wgpu_velocity_pipeline(state: &mut WgpuRenderState) {
    if ensure_scene2d_wgpu_runtime(state)
        .velocity_pipeline
        .is_some()
    {
        return;
    }

    let native = get_wgpu_render_state_native_device(state);
    let device = &native.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(VELOCITY_WGSL.into()),
    });
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: true,
                min_binding_size: None,
            },
            count: None,
        }],
    });
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(&bind_group_layout)],
        immediate_size: 0,
    });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: None,
        layout: Some(&layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[],
        },
        // Velocity is written, not blended: the cleared background is zero velocity and quads
        // overwrite it.
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: Some("fs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: wgpu::TextureFormat::Rgba16Float,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..wgpu::PrimitiveState::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    });
    let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: (UNIFORM_SLOTS * UNIFORM_STRIDE) as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                buffer: &uniform_buffer,
                offset: 0,
                size: std::num::NonZeroU64::new(UNIFORM_BYTES as u64),
            }),
        }],
    });

    ensure_scene2d_wgpu_runtime(state).velocity_pipeline = Some(WgpuVelocityPipeline {
        pipeline,
        uniform_buffer,
        bind_group,
        cursor: 0,
        scratch: [0.0; 8],
    });
}

/// The velocity writer registered for `kind` on `state`, or `None` (TS `getWgpuVelocityWriter`).
pub fn get_wgpu_velocity_writer(
    state: &WgpuRenderState,
    kind: &Kind,
) -> Option<WgpuVelocityWriter> {
    return get_wgpu_render_state_runtime(state)
        .registries
        .velocity_writers
        .entries
        .get(kind)
        .copied();
}

/// Registers the velocity writer for `kind` (TS `registerWgpuVelocityWriter`), replacing the
/// state's writer table with a copy that carries it.
pub fn register_wgpu_velocity_writer(
    state: &mut WgpuRenderState,
    kind: Kind,
    writer: WgpuVelocityWriter,
) {
    let runtime = get_wgpu_render_state_runtime_mut(state);
    runtime.registries.velocity_writers = Arc::new(with_kind_map_entry(
        &runtime.registries.velocity_writers,
        kind,
        writer,
    ));
}

/// Walks `root`'s subtree and writes every moving renderable's velocity into `target`, dispatching
/// the registered writer for each node's kind (TS `renderWgpuVelocity`). Nodes whose kind has no
/// writer are skipped. Runs inside the frame's command encoder as its own render pass; the caller's
/// pass is suspended and resumed with its pixels intact.
pub fn render_wgpu_velocity(
    state: &mut WgpuRenderState,
    root: &NodeRef,
    field: &VelocityField,
    target: &WgpuTextureRenderTarget,
) {
    if get_wgpu_render_state_runtime(state)
        .command_encoder
        .is_none()
    {
        throw_error(
            "No active command encoder — open a frame with beginWgpuRenderPass before renderWgpuVelocity.",
        );
    }
    // The velocity buffer is written in its own pass over its own target, so the caller's pass
    // steps aside for the duration and is resumed with its pixels intact.
    let suspended = get_wgpu_active_render_pass(state).is_some();
    if suspended && let Some(mut pass) = get_wgpu_active_render_pass_handle(state) {
        suspend_wgpu_render_pass(&mut pass);
    }

    ensure_wgpu_velocity_pipeline(state);
    let runtime = ensure_scene2d_wgpu_runtime(state);
    let pipeline = runtime
        .velocity_pipeline
        .as_mut()
        .expect("the velocity pipeline was ensured above");
    pipeline.cursor = 0;
    let render_pipeline = pipeline.pipeline.clone();

    let encoder = get_wgpu_render_state_runtime_mut(state)
        .command_encoder
        .as_mut()
        .unwrap();
    let mut pass = encoder
        .begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &target.view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        })
        .forget_lifetime();
    pass.set_viewport(
        0.0,
        0.0,
        target.width as f32,
        target.height as f32,
        0.0,
        1.0,
    );
    pass.set_pipeline(&render_pipeline);
    ensure_scene2d_wgpu_runtime(state).velocity_pass = Some(pass);

    let pixel_ratio = state.render_state().pixel_ratio;
    let mut ctx = WgpuVelocityContext {
        state,
        field,
        width: target.width as f32,
        height: target.height as f32,
        pixel_ratio,
    };
    visit_wgpu_velocity(&mut ctx, root);

    let state = ctx.state;
    // Dropping the pass ends it.
    ensure_scene2d_wgpu_runtime(state).velocity_pass = None;
    if suspended && let Some(mut pass) = get_wgpu_active_render_pass_handle(state) {
        resume_wgpu_render_pass(&mut pass);
    }
}

fn visit_wgpu_velocity(ctx: &mut WgpuVelocityContext<'_>, node: &NodeRef) {
    let kind = node.read().unwrap().node_fields().kind.clone();
    if let Some(writer) = get_wgpu_velocity_writer(ctx.state, &kind) {
        writer(ctx, node);
    }

    let count = get_node_child_count(node);
    for i in 0..count {
        if let Some(child) = get_node_child_at(node, i as i32) {
            visit_wgpu_velocity(ctx, &child);
        }
    }
}

/// The default writer for plain display-object nodes (TS `wgpuNode2DVelocityWriter`): covers the
/// node's world bounds with its velocity. Batched kinds register per-instance writers.
pub fn wgpu_node2d_velocity_writer(ctx: &mut WgpuVelocityContext<'_>, node: &NodeRef) {
    let mut velocity = Velocity2D { x: 0.0, y: 0.0 };
    get_velocity(
        ctx.field,
        get_entity_id(&*node.read().unwrap()),
        &mut velocity,
    );
    if velocity.x == 0.0 && velocity.y == 0.0 {
        return;
    }
    let bounds = get_node_world_bounds_rectangle(node);
    draw_wgpu_velocity_quad(
        ctx,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        velocity.x,
        velocity.y,
    );
}

/// The ParticleEmitter2D writer (TS `wgpuParticleEmitter2DVelocityWriter`): PER-PARTICLE velocity,
/// each over the particle's world rect reconstructed exactly as the particle renderer composes its
/// quad, then mapped by the emitter world transform (skipped for world-space particles). Skips
/// particles at rest and emitters without a populated velocities array.
pub fn wgpu_particle_emitter2d_velocity_writer(ctx: &mut WgpuVelocityContext<'_>, node: &NodeRef) {
    let world_space = {
        let guard = node.read().unwrap();
        let Some(emitter) = guard.as_any().downcast_ref::<ParticleEmitter2D>() else {
            return;
        };
        let data = &emitter.data;
        if data.atlas.is_none()
            || data.particle_count == 0
            || data.velocities.len() < data.particle_count * 2
        {
            return;
        }
        data.world_space
    };

    let (mut wa, mut wb, mut wc, mut wd, mut wtx, mut wty) = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    if !world_space {
        let transform = get_node_world_matrix(node);
        (wa, wb, wc, wd, wtx, wty) = (
            transform.a,
            transform.b,
            transform.c,
            transform.d,
            transform.tx,
            transform.ty,
        );
    }

    let guard = node.read().unwrap();
    let emitter = guard.as_any().downcast_ref::<ParticleEmitter2D>().unwrap();
    let data = &emitter.data;
    let atlas = data.atlas.as_ref().unwrap().read().unwrap();
    let regions = &atlas.regions;
    let num_regions = regions.len() as i32;

    for i in 0..data.particle_count {
        let velocity_x = data.velocities[i * 2];
        let velocity_y = data.velocities[i * 2 + 1];
        if velocity_x == 0.0 && velocity_y == 0.0 {
            continue;
        }
        let id = data.ids[i] as i32;
        if id < 0 || id >= num_regions {
            continue;
        }
        let region = regions[id as usize].read().unwrap();
        let rotated = region.rotation != TextureAtlasRotation::None;
        let rw = if rotated { region.height } else { region.width };
        let rh = if rotated { region.width } else { region.height };
        if rw <= 0.0 || rh <= 0.0 {
            continue;
        }

        let tt = i * 4;
        let px = data.transforms[tt];
        let py = data.transforms[tt + 1];
        let rotation = data.transforms[tt + 2];
        let scale = data.transforms[tt + 3];
        let cos_scale = rotation.cos() * scale;
        let sin_scale = rotation.sin() * scale;

        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        for c in 0..4 {
            let lx = (c & 1) as f32 * rw;
            let ly = (c >> 1) as f32 * rh;
            let rx = cos_scale * lx - sin_scale * ly + px;
            let ry = sin_scale * lx + cos_scale * ly + py;
            let wx = if world_space {
                rx
            } else {
                wa * rx + wc * ry + wtx
            };
            let wy = if world_space {
                ry
            } else {
                wb * rx + wd * ry + wty
            };
            min_x = min_x.min(wx);
            max_x = max_x.max(wx);
            min_y = min_y.min(wy);
            max_y = max_y.max(wy);
        }
        draw_wgpu_velocity_quad(
            ctx,
            min_x,
            min_y,
            max_x - min_x,
            max_y - min_y,
            velocity_x,
            velocity_y,
        );
    }
}

/// The QuadBatch writer (TS `wgpuQuadBatchVelocityWriter`): PER-INSTANCE velocity over each
/// instance's own world-space region (batch world transform ∘ per-instance local transform), when
/// the batch carries per-instance velocities; otherwise one coarse field velocity over the batch's
/// world bounds, like the Node2D writer.
pub fn wgpu_quad_batch_velocity_writer(ctx: &mut WgpuVelocityContext<'_>, node: &NodeRef) {
    let has_instances = {
        let guard = node.read().unwrap();
        let Some(batch) = guard.as_any().downcast_ref::<QuadBatch>() else {
            return;
        };
        let runtime = get_quad_batch_runtime(batch);
        let instance_velocities = runtime.read().unwrap().instance_velocities.is_some();
        instance_velocities && batch.data.atlas.is_some() && batch.data.instance_count > 0
    };

    if has_instances {
        let transform = get_node_world_matrix(node);
        let (pa, pb, pc, pd, ptx, pty) = (
            transform.a,
            transform.b,
            transform.c,
            transform.d,
            transform.tx,
            transform.ty,
        );
        let guard = node.read().unwrap();
        let batch = guard.as_any().downcast_ref::<QuadBatch>().unwrap();
        let runtime = get_quad_batch_runtime(batch);
        let runtime = runtime.read().unwrap();
        let instance_velocities = runtime.instance_velocities.as_ref().unwrap();
        let data = &batch.data;
        let atlas = data.atlas.as_ref().unwrap().read().unwrap();
        let regions = &atlas.regions;
        let num_regions = regions.len() as i32;
        let is_vector2 = data.transform_type == QuadTransformType::Vector2;
        let transforms = &data.transforms;
        for i in 0..data.instance_count {
            let velocity_x = instance_velocities[i * 2];
            let velocity_y = instance_velocities[i * 2 + 1];
            if velocity_x == 0.0 && velocity_y == 0.0 {
                continue;
            }
            let id = data.ids[i] as i32;
            if id < 0 || id >= num_regions {
                continue;
            }
            let region = regions[id as usize].read().unwrap();
            let rotated = region.rotation != TextureAtlasRotation::None;
            let w = if rotated { region.height } else { region.width };
            let h = if rotated { region.width } else { region.height };
            if w <= 0.0 || h <= 0.0 {
                continue;
            }

            let (wa, wb, wc, wd, wtx, wty);
            if is_vector2 {
                let dx = transforms[i * 2];
                let dy = transforms[i * 2 + 1];
                wa = pa;
                wb = pb;
                wc = pc;
                wd = pd;
                wtx = pa * dx + pc * dy + ptx;
                wty = pb * dx + pd * dy + pty;
            } else {
                let o = i * 6;
                let (la, lb, lc, ld, ltx, lty) = (
                    transforms[o],
                    transforms[o + 1],
                    transforms[o + 2],
                    transforms[o + 3],
                    transforms[o + 4],
                    transforms[o + 5],
                );
                wa = pa * la + pc * lb;
                wb = pb * la + pd * lb;
                wc = pa * lc + pc * ld;
                wd = pb * lc + pd * ld;
                wtx = pa * ltx + pc * lty + ptx;
                wty = pb * ltx + pd * lty + pty;
            }

            let (x0, y0) = (wtx, wty);
            let (x1, y1) = (wa * w + wtx, wb * w + wty);
            let (x2, y2) = (wc * h + wtx, wd * h + wty);
            let (x3, y3) = (wa * w + wc * h + wtx, wb * w + wd * h + wty);
            let min_x = x0.min(x1).min(x2).min(x3);
            let min_y = y0.min(y1).min(y2).min(y3);
            let max_x = x0.max(x1).max(x2).max(x3);
            let max_y = y0.max(y1).max(y2).max(y3);
            draw_wgpu_velocity_quad(
                ctx,
                min_x,
                min_y,
                max_x - min_x,
                max_y - min_y,
                velocity_x,
                velocity_y,
            );
        }
        return;
    }

    wgpu_node2d_velocity_writer(ctx, node);
}
