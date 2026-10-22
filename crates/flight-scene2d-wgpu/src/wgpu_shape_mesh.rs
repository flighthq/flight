// flight-lint: allow-file(contract-vocabulary) D17 shape-mesh draw contracts carry native wgpu buffers, bind groups and pipelines
//! The tessellated solid-fill path for Shape (TS `wgpuShapeMesh.ts`), the counterpart to the GL
//! shape mesh: each fill region is tessellated to a triangle mesh (cached by content version in the
//! shape renderers) and drawn with a flat-color pipeline, transformed by the node world transform in
//! the vertex shader so it stays crisp at any zoom.
//!
//! The fill is gated by any active contour clip: the pipeline compares stencil `equal`
//! currentMaskDepth and writes nothing back, so at depth 0 the cleared stencil passes everywhere and
//! inside a clip only the clip's stamped region passes. Blend state is immutable in WebGPU, so the
//! pipeline cache is keyed by the node's fixed-function blend mode and target format.

use std::collections::HashMap;

use flight_render::RenderProxy2D;
use flight_render_wgpu::{
    WgpuCommandRecord, WgpuRenderPipelineRecord, WgpuRenderState, WgpuShapeMeshBuffers,
    WgpuShapeMeshPipeline, get_wgpu_blend_state, get_wgpu_render_pass_viewport,
    get_wgpu_render_state_native_device, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut, record_wgpu_command, retire_wgpu_buffer, write_wgpu_buffer,
};

use crate::types::*;
use crate::wgpu_quad_batch_writer::{
    flush_wgpu_quad_batch_writer, resolve_wgpu_color_adjustment_material_feature, wgpu_f32_bytes,
};

const SHAPE_MESH_WGSL: &str = r"
struct ShapeMeshUniforms { matrix : mat3x3f, color : vec4f }
@group(0) @binding(0) var<uniform> u : ShapeMeshUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return u.color; }
";

// mat3x3f occupies 48 bytes (three vec3 columns each padded to 16), then a vec4f color (16 bytes).
const SHAPE_MESH_UNIFORM_BYTES: usize = 64;
const SHAPE_MESH_UNIFORM_FLOATS: usize = SHAPE_MESH_UNIFORM_BYTES / 4;

// The shared position-only vertex layout (float2) of the shape-mesh and clip pipelines.
pub(crate) const SHAPE_MESH_VERTEX_ATTRIBUTES: [wgpu::VertexAttribute; 1] =
    [wgpu::VertexAttribute {
        format: wgpu::VertexFormat::Float32x2,
        offset: 0,
        shader_location: 0,
    }];

// A uniform bind-group layout visible to both stages, for the shape-mesh pipelines.
pub(crate) fn create_shape_mesh_bind_group_layout(
    state: &WgpuRenderState,
) -> wgpu::BindGroupLayout {
    return get_wgpu_render_state_native_device(state)
        .device
        .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
}

// Builds one flat-fill pipeline over `module` whose single uniform group is `bind_group_layout`, gated
// by stencil 'equal' with no stencil writes, and reports it to the device's command observer.
pub(crate) fn create_shape_mesh_pipeline(
    state: &WgpuRenderState,
    module: &wgpu::ShaderModule,
    bind_group_layout: &wgpu::BindGroupLayout,
    format: wgpu::TextureFormat,
    blend: wgpu::BlendState,
) -> wgpu::RenderPipeline {
    let native = get_wgpu_render_state_native_device(state);
    let layout = native
        .device
        .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[Some(bind_group_layout)],
            immediate_size: 0,
        });
    let targets = [Some(wgpu::ColorTargetState {
        format,
        // The geometry carries premultiplied color; all supported node modes use the shared
        // render-wgpu fixed-function table.
        blend: Some(blend),
        write_mask: wgpu::ColorWrites::ALL,
    })];
    let stencil_face = wgpu::StencilFaceState {
        compare: wgpu::CompareFunction::Equal,
        fail_op: wgpu::StencilOperation::Keep,
        depth_fail_op: wgpu::StencilOperation::Keep,
        pass_op: wgpu::StencilOperation::Keep,
    };
    let depth_stencil = wgpu::DepthStencilState {
        format: wgpu::TextureFormat::Depth24PlusStencil8,
        depth_write_enabled: Some(false),
        depth_compare: Some(wgpu::CompareFunction::Always),
        // Gate the fill by any active contour clip without disturbing the stencil (writeMask 0).
        stencil: wgpu::StencilState {
            front: stencil_face,
            back: stencil_face,
            read_mask: 0xff,
            write_mask: 0x00,
        },
        bias: wgpu::DepthBiasState::default(),
    };
    let pipeline = native
        .device
        .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers: &[Some(wgpu::VertexBufferLayout {
                    array_stride: 8,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &SHAPE_MESH_VERTEX_ATTRIBUTES,
                })],
            },
            fragment: Some(wgpu::FragmentState {
                module,
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
}

/// Draws the shape's tessellated meshes through `pipeline_entry` (TS `drawWgpuShapeMeshBatch`).
/// `uniform_data` already carries any pipeline-specific tail after the shared matrix + color fields;
/// the driver writes only those common fields. Distinct uniform/bind-group arrays let the opt-in
/// color-adjustment feature own a larger uniform without taxing the lean path's 64-byte bindings.
pub fn draw_wgpu_shape_mesh_batch(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
    meshes: &[WgpuShapeMesh],
    buffers: &mut WgpuShapeMeshBuffers,
    pipeline_entry: &WgpuShapeMeshPipeline,
    uniform_buffers: &mut Vec<wgpu::Buffer>,
    bind_groups: &mut Vec<wgpu::BindGroup>,
    uniform_data: &mut [f32],
) {
    if meshes.is_empty() {
        return;
    }
    flush_wgpu_quad_batch_writer(state);

    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }

    let native = get_wgpu_render_state_native_device(state);

    // Writes the projection·world matrix into uniform columns 0..11; per-mesh color fills 12..15 in
    // the loop. Any pipeline-specific tail starts at 16 and is left untouched.
    shape_mesh_matrix(state, render_proxy, uniform_data);

    {
        let runtime = get_wgpu_render_state_runtime_mut(state);
        let mask_depth = runtime.current_mask_depth;
        let pass = runtime.render_pass.as_mut().unwrap();
        pass.set_pipeline(&pipeline_entry.pipeline);
        // The cleared stencil is 0, so at depth 0 'equal 0' passes everywhere; inside a contour clip
        // only its stamped region equals currentMaskDepth, so the fill is confined to the clip.
        pass.set_stencil_reference(mask_depth);
    }

    let node_alpha = render_proxy.alpha;
    for (i, mesh) in meshes.iter().enumerate() {
        if mesh.indices.is_empty() {
            continue;
        }
        let a = mesh.alpha * node_alpha;
        if a <= 0.0 {
            continue;
        }

        ensure_shape_mesh_uniform(
            state,
            pipeline_entry,
            uniform_buffers,
            bind_groups,
            i,
            std::mem::size_of_val(uniform_data) as u64,
        );
        let vertex_bytes = std::mem::size_of_val(mesh.vertices.as_slice()) as u64;
        let index_bytes = std::mem::size_of_val(mesh.indices.as_slice()) as u64;
        let vertex_buffer = ensure_shape_mesh_vertex_buffer(state, buffers, i, vertex_bytes);
        let index_buffer = ensure_shape_mesh_index_buffer(state, buffers, i, index_bytes);
        if vertex_bytes > 0 {
            write_wgpu_buffer(&native, &vertex_buffer, 0, wgpu_f32_bytes(&mesh.vertices));
        }
        write_shape_mesh_indices(state, &index_buffer, &mesh.indices);

        let r = ((mesh.color >> 24) & 0xff) as f32 / 255.0;
        let g = ((mesh.color >> 16) & 0xff) as f32 / 255.0;
        let b = ((mesh.color >> 8) & 0xff) as f32 / 255.0;
        let ca = ((mesh.color & 0xff) as f32 / 255.0) * a;
        uniform_data[12] = r * ca;
        uniform_data[13] = g * ca;
        uniform_data[14] = b * ca;
        uniform_data[15] = ca;
        write_wgpu_buffer(
            &native,
            &uniform_buffers[i],
            0,
            wgpu_f32_bytes(uniform_data),
        );

        let bind_group = bind_groups[i].clone();
        let pass = get_wgpu_render_state_runtime_mut(state)
            .render_pass
            .as_mut()
            .unwrap();
        pass.set_bind_group(0, &bind_group, &[]);
        pass.set_vertex_buffer(0, vertex_buffer.slice(..));
        pass.set_index_buffer(index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        pass.draw_indexed(0..mesh.indices.len() as u32, 0, 0..1);
    }
}

/// Draws the shape's tessellated meshes (TS `drawWgpuShapeMeshes`). Delegates to the registered
/// color-adjustment feature only for a resolved ColorScaleBias; a full color matrix stays outside
/// this bounded fold. Otherwise the lean flat-color pipeline and 64-byte uniform stay unchanged and
/// carry no adjustment shader code.
pub fn draw_wgpu_shape_meshes(
    state: &mut WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
    meshes: &[WgpuShapeMesh],
    buffers: &mut WgpuShapeMeshBuffers,
) {
    if meshes.is_empty() {
        return;
    }
    let fold = resolve_wgpu_color_adjustment_material_feature(state)
        .and_then(|feature| feature.draw_shape_meshes);
    if let Some(draw_shape_meshes) = fold
        && render_proxy.color_matrix.is_none()
        && render_proxy.color_scale_bias.is_some()
    {
        draw_shape_meshes(state, render_proxy, meshes, buffers);
        return;
    }
    let pipeline_entry = ensure_shape_mesh_pipeline(state, render_proxy.blend_mode.as_ref());
    let mut uniform_buffers = std::mem::take(&mut buffers.uniform_buffers);
    let mut bind_groups = std::mem::take(&mut buffers.bind_groups);
    let mut uniform_data = [0.0_f32; SHAPE_MESH_UNIFORM_FLOATS];
    draw_wgpu_shape_mesh_batch(
        state,
        render_proxy,
        meshes,
        buffers,
        &pipeline_entry,
        &mut uniform_buffers,
        &mut bind_groups,
        &mut uniform_data,
    );
    buffers.uniform_buffers = uniform_buffers;
    buffers.bind_groups = bind_groups;
}

fn ensure_shape_mesh_index_buffer(
    state: &mut WgpuRenderState,
    buffers: &mut WgpuShapeMeshBuffers,
    mesh_index: usize,
    byte_length: u64,
) -> wgpu::Buffer {
    // Index buffers must be a multiple of 4 bytes for COPY_DST writes; round up the requested size.
    let size = 4.max((byte_length + 3) & !3);
    let capacity = buffers
        .index_capacities
        .get(mesh_index)
        .copied()
        .unwrap_or(0);
    if let Some(buffer) = buffers.index_buffers.get(mesh_index)
        && capacity >= size
    {
        return buffer.clone();
    }
    if let Some(buffer) = buffers.index_buffers.get(mesh_index).cloned() {
        retire_wgpu_buffer(state, buffer);
    }
    let buffer = get_wgpu_render_state_native_device(state)
        .device
        .create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size,
            usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
    set_slot(&mut buffers.index_buffers, mesh_index, buffer.clone());
    set_slot(&mut buffers.index_capacities, mesh_index, size);
    return buffer;
}

fn ensure_shape_mesh_pipeline(
    state: &mut WgpuRenderState,
    blend_mode: Option<&flight_materials::BlendMode>,
) -> WgpuShapeMeshPipeline {
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let key = format!(
        "{:?}|{}",
        format,
        blend_mode.map(|mode| mode.as_str()).unwrap_or("null")
    );
    if let Some(existing) = get_wgpu_render_state_runtime(state)
        .shape_mesh_pipelines
        .as_ref()
        .and_then(|cache| cache.get(&key))
    {
        return existing.clone();
    }

    let native = get_wgpu_render_state_native_device(state);
    let module = native
        .device
        .create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(SHAPE_MESH_WGSL.into()),
        });
    let bind_group_layout = create_shape_mesh_bind_group_layout(state);
    let pipeline = create_shape_mesh_pipeline(
        state,
        &module,
        &bind_group_layout,
        format,
        get_wgpu_blend_state(blend_mode),
    );
    let entry = WgpuShapeMeshPipeline {
        pipeline,
        bind_group_layout,
    };
    get_wgpu_render_state_runtime_mut(state)
        .shape_mesh_pipelines
        .get_or_insert_with(HashMap::new)
        .insert(key, entry.clone());
    return entry;
}

// Lazily builds (once per shape) the uniform buffer + bind group for one mesh slot.
fn ensure_shape_mesh_uniform(
    state: &WgpuRenderState,
    pipeline_entry: &WgpuShapeMeshPipeline,
    uniform_buffers: &mut Vec<wgpu::Buffer>,
    bind_groups: &mut Vec<wgpu::BindGroup>,
    mesh_index: usize,
    byte_length: u64,
) {
    if uniform_buffers.len() > mesh_index {
        return;
    }
    let native = get_wgpu_render_state_native_device(state);
    let uniform_buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: byte_length,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let bind_group = native.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &pipeline_entry.bind_group_layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: uniform_buffer.as_entire_binding(),
        }],
    });
    set_slot(uniform_buffers, mesh_index, uniform_buffer);
    set_slot(bind_groups, mesh_index, bind_group);
}

fn ensure_shape_mesh_vertex_buffer(
    state: &mut WgpuRenderState,
    buffers: &mut WgpuShapeMeshBuffers,
    mesh_index: usize,
    byte_length: u64,
) -> wgpu::Buffer {
    let size = 8.max(byte_length);
    let capacity = buffers
        .vertex_capacities
        .get(mesh_index)
        .copied()
        .unwrap_or(0);
    if let Some(buffer) = buffers.vertex_buffers.get(mesh_index)
        && capacity >= size
    {
        return buffer.clone();
    }
    if let Some(buffer) = buffers.vertex_buffers.get(mesh_index).cloned() {
        retire_wgpu_buffer(state, buffer);
    }
    let buffer = get_wgpu_render_state_native_device(state)
        .device
        .create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
    set_slot(&mut buffers.vertex_buffers, mesh_index, buffer.clone());
    set_slot(&mut buffers.vertex_capacities, mesh_index, size);
    return buffer;
}

// TS `array[index] = value` on a dense array: the slots are filled in mesh order, so the index is at
// most the current length.
fn set_slot<T>(values: &mut Vec<T>, index: usize, value: T) {
    if index < values.len() {
        values[index] = value;
    } else {
        values.push(value);
    }
}

// Column-major mat3x3f = projection · worldTransform, mapping shape-local points to clip space exactly
// as the clip contours and the quad draw build it. Each column is padded to 4 floats; the color
// (floats 12..15) is filled per mesh by the caller.
fn shape_mesh_matrix(
    state: &WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
    out: &mut [f32],
) {
    let viewport = get_wgpu_render_pass_viewport(state);
    let iw = 2.0
        / if viewport.width != 0.0 {
            viewport.width
        } else {
            1.0
        };
    let ih = 2.0
        / if viewport.height != 0.0 {
            viewport.height
        } else {
            1.0
        };
    let t = &render_proxy.transform_2d;
    out[0] = t.a * iw;
    out[1] = -t.b * ih;
    out[2] = 0.0;
    out[3] = 0.0;
    out[4] = t.c * iw;
    out[5] = -t.d * ih;
    out[6] = 0.0;
    out[7] = 0.0;
    out[8] = t.tx * iw - 1.0;
    out[9] = -t.ty * ih + 1.0;
    out[10] = 1.0;
    out[11] = 0.0;
}

// Uploads uint16 indices to the index buffer. A queue write must be a multiple of 4 bytes, so an odd
// index count (e.g. a single triangle, 3 indices = 6 bytes) is padded with a trailing index that is
// never drawn (the draw uses `indices.len()`).
fn write_shape_mesh_indices(state: &WgpuRenderState, index_buffer: &wgpu::Buffer, indices: &[u16]) {
    let native = get_wgpu_render_state_native_device(state);
    let mut bytes: Vec<u8> = indices
        .iter()
        .flat_map(|index| index.to_ne_bytes())
        .collect();
    let padded = (bytes.len() + 3) & !3;
    bytes.resize(padded, 0);
    write_wgpu_buffer(&native, index_buffer, 0, &bytes);
}
