// flight-lint: allow-file(contract-vocabulary) D17 clip helpers drive wgpu stencil state over native buffers and render-wgpu state
//! Contour clips via stencil nesting (TS `wgpuClipContours.ts`). A path ClipRegion is realized by
//! stamping its covered pixels into the stencil buffer; content then draws in the 'masked' stencil
//! mode (compare equal, reference = currentMaskDepth).
//!
//! NESTING MODEL — WebGPU cannot clear the stencil mid pass, so each clip INCREMENTS the stencil
//! from its parent depth d to d+1 inside the polygon (compare 'equal' d, increment-clamp); pop
//! redraws the same geometry to DECREMENT back to d. Sibling-safe and nests cleanly; scissor
//! (rect) clips compose independently.
//!
//! LIMITATION: increment-clamp counts coverage, not winding, so a simple/convex contour clips
//! exactly but holes and self-intersecting even-odd fills are not yet honored — `winding` is
//! accepted but not applied, as on the GL backend.

use std::collections::HashMap;

use flight_geometry::Matrix;
use flight_path::PathWinding;
use flight_render_wgpu::{
    WgpuClipContourEntry, WgpuClipContourPipelines, WgpuCommandRecord, WgpuRenderPipelineRecord,
    WgpuRenderState, get_wgpu_render_pass_viewport, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut, record_wgpu_command,
    retire_wgpu_buffer, write_wgpu_buffer,
};

use crate::wgpu_quad_batch_writer::{flush_wgpu_quad_batch_writer, wgpu_f32_bytes};
use crate::wgpu_shape_mesh::SHAPE_MESH_VERTEX_ATTRIBUTES;

const CLIP_WGSL: &str = r"
struct ClipUniforms { matrix : mat3x3f }
@group(0) @binding(0) var<uniform> u : ClipUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return vec4f(0.0); }
";

// mat3x3f in a uniform buffer has a 16-byte column stride (each vec3 column padded to vec4).
const CLIP_UNIFORM_BYTES: u64 = 48;

fn create_clip_contour_uniform_buffer(state: &WgpuRenderState, t: &Matrix) -> wgpu::Buffer {
    let viewport = get_wgpu_render_pass_viewport(state);
    let iw = 2.0 / viewport.width;
    let ih = 2.0 / viewport.height;
    // Column-major mat3x3f = projection · worldTransform, mapping clip-local points to clip space
    // exactly as the quad draw builds the content matrix. Each column is padded to 4 floats.
    let mut m = [0.0_f32; 12];
    m[0] = t.a * iw;
    m[1] = -t.b * ih;
    m[2] = 0.0;
    m[4] = t.c * iw;
    m[5] = -t.d * ih;
    m[6] = 0.0;
    m[8] = t.tx * iw - 1.0;
    m[9] = -t.ty * ih + 1.0;
    m[10] = 1.0;
    let native = get_wgpu_render_state_native_device(state);
    let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: CLIP_UNIFORM_BYTES,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    write_wgpu_buffer(&native, &buffer, 0, wgpu_f32_bytes(&m));
    return buffer;
}

// Expands each contour's triangle fan (origin, i, i+1) into a triangle-list vertex buffer — WebGPU
// has no TRIANGLE_FAN topology. Color writes are masked off, so only the stencil moves.
// flight-lint: allow(f64) clip contours are the exact f64 coordinate arrays flight-clip stores
fn create_clip_contour_vertex_buffer(
    state: &WgpuRenderState,
    contours: &[Vec<f64>],
) -> (wgpu::Buffer, u32) {
    let mut tris: Vec<f32> = Vec::new();
    for contour in contours {
        let point_count = contour.len() >> 1;
        if point_count < 3 {
            continue;
        }
        for i in 1..point_count - 1 {
            tris.extend_from_slice(&[
                contour[0] as f32,
                contour[1] as f32,
                contour[i * 2] as f32,
                contour[i * 2 + 1] as f32,
                contour[(i + 1) * 2] as f32,
                contour[(i + 1) * 2 + 1] as f32,
            ]);
        }
    }
    let vertex_count = (tris.len() >> 1) as u32;
    let byte_length = std::mem::size_of_val(tris.as_slice()) as u64;
    let native = get_wgpu_render_state_native_device(state);
    let vertex_buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: 4.max(byte_length),
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    if byte_length > 0 {
        write_wgpu_buffer(&native, &vertex_buffer, 0, wgpu_f32_bytes(&tris));
    }
    return (vertex_buffer, vertex_count);
}

fn ensure_clip_contour_pipelines(state: &mut WgpuRenderState) -> WgpuClipContourPipelines {
    let runtime = get_wgpu_render_state_runtime(state);
    let format = runtime.current_color_format.unwrap_or(state.format);
    if let Some(existing) = runtime
        .clip_contour_pipelines
        .as_ref()
        .and_then(|cache| cache.get(&format))
    {
        return existing.clone();
    }

    let native = get_wgpu_render_state_native_device(state);
    let device = &native.device;
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(CLIP_WGSL.into()),
    });
    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
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

    let make = |pass_op: wgpu::StencilOperation| -> wgpu::RenderPipeline {
        let stencil_face = wgpu::StencilFaceState {
            compare: wgpu::CompareFunction::Equal,
            fail_op: wgpu::StencilOperation::Keep,
            depth_fail_op: wgpu::StencilOperation::Keep,
            pass_op,
        };
        let targets = [Some(wgpu::ColorTargetState {
            format,
            blend: None,
            write_mask: wgpu::ColorWrites::empty(),
        })];
        let depth_stencil = wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth24PlusStencil8,
            depth_write_enabled: Some(false),
            depth_compare: Some(wgpu::CompareFunction::Always),
            stencil: wgpu::StencilState {
                front: stencil_face,
                back: stencil_face,
                read_mask: 0xff,
                write_mask: 0xff,
            },
            bias: wgpu::DepthBiasState::default(),
        };
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[Some(wgpu::VertexBufferLayout {
                    array_stride: 8,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &SHAPE_MESH_VERTEX_ATTRIBUTES,
                })],
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                targets: &targets,
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..wgpu::PrimitiveState::default()
            },
            depth_stencil: Some(depth_stencil.clone()),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        record_wgpu_command(&native, || {
            return WgpuCommandRecord::CreateRenderPipeline(WgpuRenderPipelineRecord {
                depth_stencil: Some(depth_stencil.clone()),
                pipeline: pipeline.clone(),
                targets: targets.to_vec(),
            });
        });
        return pipeline;
    };

    let pipelines = WgpuClipContourPipelines {
        write: make(wgpu::StencilOperation::IncrementClamp),
        erase: make(wgpu::StencilOperation::DecrementClamp),
        bind_group_layout,
    };
    get_wgpu_render_state_runtime_mut(state)
        .clip_contour_pipelines
        .get_or_insert_with(HashMap::new)
        .insert(format, pipelines.clone());
    return pipelines;
}

/// Pops the innermost contour clip (TS `popWgpuClipContours`), redrawing its geometry to decrement
/// the stencil back to the parent's depth, then retires its buffers until the frame submits.
pub fn pop_wgpu_clip_contours(state: &mut WgpuRenderState) {
    flush_wgpu_quad_batch_writer(state);
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let entry = runtime.clip_contour_stack.pop();
    runtime.current_mask_depth = runtime.current_mask_depth.saturating_sub(1);

    if let Some(entry) = &entry
        && runtime.render_pass.is_some()
    {
        let pipelines = ensure_clip_contour_pipelines(state);
        let pass = get_wgpu_render_state_runtime_mut(state)
            .render_pass
            .as_mut()
            .unwrap();
        // Decrement this clip's covered pixels from (depth + 1) back to depth, restoring the
        // parent's stencil so sibling clips and the parent's own content test correctly.
        pass.set_pipeline(&pipelines.erase);
        pass.set_bind_group(0, &entry.bind_group, &[]);
        pass.set_vertex_buffer(0, entry.vertex_buffer.slice(..));
        pass.set_stencil_reference(entry.depth + 1);
        if entry.vertex_count > 0 {
            pass.draw(0..entry.vertex_count, 0..1);
        }
    }
    if let Some(entry) = entry {
        // The erase draw just recorded references these buffers; the frame's submit is deferred,
        // so their destruction is deferred until after it.
        retire_wgpu_buffer(state, entry.vertex_buffer);
        retire_wgpu_buffer(state, entry.uniform_buffer);
    }
}

/// Pushes a contour clip (TS `pushWgpuClipContours`): stamps the contours' coverage from the parent
/// depth to depth + 1, so content drawn now tests stencil == the new mask depth.
// flight-lint: allow(f64) clip contours are the exact f64 coordinate arrays flight-clip stores; the upload narrows them as the source's Float32Array does
pub fn push_wgpu_clip_contours(
    state: &mut WgpuRenderState,
    contours: &[Vec<f64>],
    winding: PathWinding,
    world_transform: &Matrix,
) {
    flush_wgpu_quad_batch_writer(state);
    // Coverage-based; winding (even-odd vs non-zero, holes) is not yet applied — see the module
    // header.
    let _ = winding;

    let depth = get_wgpu_render_state_runtime(state).current_mask_depth;
    let pipelines = ensure_clip_contour_pipelines(state);
    let (vertex_buffer, vertex_count) = create_clip_contour_vertex_buffer(state, contours);
    let uniform_buffer = create_clip_contour_uniform_buffer(state, world_transform);
    let bind_group = get_wgpu_render_state_native_device(state)
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &pipelines.bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

    let runtime = get_wgpu_render_state_runtime_mut(state);
    if let Some(pass) = runtime.render_pass.as_mut() {
        // Increment the polygon's covered pixels from the parent depth to depth + 1. The 'equal'
        // compare keeps the increment inside the parent clip and makes overlapping fan triangles
        // idempotent (only the first increments).
        pass.set_pipeline(&pipelines.write);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.set_vertex_buffer(0, vertex_buffer.slice(..));
        pass.set_stencil_reference(depth);
        if vertex_count > 0 {
            pass.draw(0..vertex_count, 0..1);
        }
    }

    runtime.clip_contour_stack.push(WgpuClipContourEntry {
        vertex_buffer,
        vertex_count,
        uniform_buffer,
        bind_group,
        depth,
    });
    // Content drawn now tests stencil == currentMaskDepth ('masked' mode).
    runtime.current_mask_depth = depth + 1;
}
