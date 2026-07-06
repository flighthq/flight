//! wgpu shape mesh — GPU-side triangle mesh for solid-fill vector shapes.
//!
//! This is the tessellated-fill path for `Shape` nodes: each solid `beginFill …
//! endFill` span is resolved into a [`flighthq_types::ShapeFillRegion`] by the
//! caller, tessellated here via [`flighthq_path::tessellate_path`], and uploaded
//! into per-node GPU vertex/index buffers. A dedicated solid-color pipeline (a
//! `vec2` position vertex buffer plus a matrix+color uniform) draws the meshes —
//! distinct from the texture-quad bitmap pipeline, which has no vertex buffer.
//!
//! Geometry reaches this module by node id: the caller passes a closure that
//! resolves `node_id -> Option<Vec<ShapeFillRegion>>` (the cleanest seam, since
//! it keeps render-wgpu free of the shape-node arena while still letting the
//! renderer own tessellation, upload, and caching). Meshes are cached per node
//! id and rebuilt only when the shape's `content_revision` changes.
//!
//! Limitations (deferred): solid single-color fills only. Multi-fill shapes draw
//! every solid span, but gradients, bitmap fills, and strokes return `None` from
//! `get_shape_fill_regions` upstream and are not handled here yet — see TODO.

use flighthq_path::tessellate_path;
use flighthq_types::{Matrix, PathMesh, ShapeFillRegion};

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_render_wgpu::{
    UNIFORM_BYTE_SIZE, WgpuShapeMesh, WgpuShapeMeshCacheEntry, WgpuStencilMode,
    build_wgpu_stencil_face_state, normal_wgpu_blend_state, set_wgpu_matrix_from_transform,
};

// Flatness tolerance for curve subdivision during fill tessellation (path units).
const SHAPE_FILL_TOLERANCE: f32 = 0.25;

// Byte size of the solid-fill uniform slot: a padded mat3x3 (12 floats) + a vec4
// color (4 floats) = 16 floats = 64 bytes. Padded up to the shared ring stride so
// it shares the dynamic-offset ring buffer with the bitmap uniforms.
const SHAPE_FILL_UNIFORM_FLOATS: usize = 16;

// WGSL solid-fill shader: a vec2 position vertex buffer transformed by the 2D
// matrix uniform, filled with a flat color. Mirrors the bitmap matrix layout so
// it can share clip-space conventions, but consumes real vertices (no builtin
// quad) and carries no texture binding.
const SHAPE_FILL_SHADER_SRC: &str = r#"
struct Uniforms {
  matrix : mat3x3f,
  color : vec4f,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;

@vertex
fn vs_main(@location(0) pos : vec2f) -> @builtin(position) vec4f {
  let p = uni.matrix * vec3f(pos.x, pos.y, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4f {
  // Premultiplied output to match the Normal (one, one-minus-src-alpha) blend.
  return vec4f(uni.color.rgb * uni.color.a, uni.color.a);
}
"#;

// `WgpuShapeMesh` and `WgpuShapeMeshCacheEntry` are backend-core runtime slot
// types (the shape-fill mesh cache lives on the render-state runtime); they live
// in `flighthq-render-wgpu`'s `runtime_types` and are imported above.

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Draws the solid fills of shape `node_id` using its tessellated mesh cache.
///
/// `regions` is the resolved solid-fill list for the node (from
/// `flighthq_shape::get_shape_fill_regions`), and `content_revision` is the
/// node's current geometry revision. When the cache is stale (or empty) the
/// regions are tessellated, uploaded, and cached before drawing. Each mesh is
/// drawn with the node's current 2D transform (read from `render_state`) through
/// the solid-fill pipeline. No-op when there is no active render pass.
pub fn draw_wgpu_shape_fill(
    state: &mut WgpuRenderState,
    node_id: u64,
    regions: &[ShapeFillRegion],
    content_revision: u32,
) {
    ensure_wgpu_shape_meshes(state, node_id, regions, content_revision);
    if state.runtime.render_pass.is_none() {
        return;
    }
    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let mesh_count = state
        .runtime
        .shape_fill_mesh_cache
        .get(&node_id)
        .map(|e| e.meshes.len())
        .unwrap_or(0);
    for i in 0..mesh_count {
        let (color, index_count) = {
            let entry = state
                .runtime
                .shape_fill_mesh_cache
                .get(&node_id)
                .expect("entry present after ensure");
            (entry.meshes[i].color, entry.meshes[i].index_count)
        };
        if index_count == 0 {
            continue;
        }
        let uniform_offset = write_wgpu_shape_fill_uniforms(state, &transform, color);
        draw_wgpu_shape_fill_mesh(state, node_id, i, uniform_offset);
    }
}

/// Draws one or more `WgpuShapeMesh` entries for `render_proxy_id` using the
/// active render pass and the pipeline/bind groups the caller has already set.
///
/// Each mesh binds its vertex and index buffers and issues an indexed draw,
/// mirroring `draw_gl_shape_meshes` (which relies on the currently-bound program).
/// No-op when there is no active render pass. Prefer `draw_wgpu_shape_fill` for
/// the cached, pipeline-managed path; this lower-level helper is for callers
/// that own the pipeline/uniform binding themselves.
pub fn draw_wgpu_shape_meshes(
    state: &mut WgpuRenderState,
    _render_proxy_id: u64,
    meshes: &[WgpuShapeMesh],
) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    for mesh in meshes {
        if mesh.index_count == 0 {
            continue;
        }
        pass.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
        pass.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        pass.draw_indexed(0..mesh.index_count, 0, 0..1);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Issues the indexed draw for mesh `i` of node `node_id`, binding the solid-fill
// pipeline, the uniform slot at `uniform_offset`, and the mesh's buffers.
fn draw_wgpu_shape_fill_mesh(
    state: &mut WgpuRenderState,
    node_id: u64,
    mesh_index: usize,
    uniform_offset: u32,
) {
    // Resolve (and cache) the pipeline before splitting borrows; this may insert
    // into the fill-pipeline cache, so it must happen while `state` is fully borrowed.
    let _ = get_wgpu_shape_fill_pipeline(state);
    let stencil = current_wgpu_shape_fill_stencil(state);
    let format = state.runtime.current_color_format.unwrap_or(state.format);
    let key = wgpu_shape_fill_pipeline_key(stencil, format);
    let mask_depth = state.runtime.current_mask_depth;

    let runtime = &mut state.runtime;
    let pipeline = runtime.shape_fill_pipeline_cache.get(&key);
    let uniform_bind_group = &runtime.uniform_bind_group;
    let entry = runtime.shape_fill_mesh_cache.get(&node_id);
    let Some(pass) = runtime.render_pass.as_mut() else {
        return;
    };
    let Some(pipeline) = pipeline else { return };
    let Some(entry) = entry else { return };
    let mesh = &entry.meshes[mesh_index];
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, uniform_bind_group, &[uniform_offset]);
    if mask_depth > 0 {
        pass.set_stencil_reference(mask_depth);
    }
    pass.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
    pass.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
    pass.draw_indexed(0..mesh.index_count, 0, 0..1);
}

// Tessellates and uploads the node's fill regions if the cache is missing or its
// content revision is stale, replacing any prior meshes (whose GPU buffers are
// freed via destroy on the way out).
fn ensure_wgpu_shape_meshes(
    state: &mut WgpuRenderState,
    node_id: u64,
    regions: &[ShapeFillRegion],
    content_revision: u32,
) {
    let fresh = state
        .runtime
        .shape_fill_mesh_cache
        .get(&node_id)
        .map(|e| e.content_revision == content_revision)
        .unwrap_or(false);
    if fresh {
        return;
    }

    if let Some(old) = state.runtime.shape_fill_mesh_cache.remove(&node_id) {
        for mesh in old.meshes {
            mesh.vertex_buffer.destroy();
            mesh.index_buffer.destroy();
        }
    }

    let mut meshes: Vec<WgpuShapeMesh> = Vec::new();
    for region in regions {
        let mut path_mesh = PathMesh::default();
        tessellate_path(&region.path, SHAPE_FILL_TOLERANCE, &mut path_mesh);
        if path_mesh.indices.is_empty() {
            continue;
        }
        let color = fold_region_color(region.color, region.alpha);
        meshes.push(upload_wgpu_shape_mesh(state, &path_mesh, color));
    }

    state.runtime.shape_fill_mesh_cache.insert(
        node_id,
        WgpuShapeMeshCacheEntry {
            content_revision,
            meshes,
        },
    );
}

// Folds a region's `[0,1]` alpha multiplier into the packed color's alpha byte.
// Colors are 0xRRGGBBaa; the RGB bytes pass through untouched (sRGB pass-through).
fn fold_region_color(color: u32, alpha: f32) -> u32 {
    let base_a = (color & 0xff) as f32 / 255.0;
    let a = (base_a * alpha.clamp(0.0, 1.0) * 255.0).round() as u32;
    (color & 0xffff_ff00) | (a & 0xff)
}

// Returns (creating on first use) the solid-fill render pipeline for the current
// stencil mode and color-attachment format. Keyed separately from the bitmap
// pipeline cache because it has a different vertex layout and bind-group layout.
fn get_wgpu_shape_fill_pipeline(state: &mut WgpuRenderState) -> &wgpu::RenderPipeline {
    let stencil = current_wgpu_shape_fill_stencil(state);
    let format = state.runtime.current_color_format.unwrap_or(state.format);
    let key = wgpu_shape_fill_pipeline_key(stencil, format);
    if !state.runtime.shape_fill_pipeline_cache.contains_key(&key) {
        let pipeline =
            create_wgpu_shape_fill_pipeline(&state.device, &state.runtime, stencil, format);
        state
            .runtime
            .shape_fill_pipeline_cache
            .insert(key.clone(), pipeline);
    }
    state
        .runtime
        .shape_fill_pipeline_cache
        .get(&key)
        .expect("shape fill pipeline was just inserted")
}

fn current_wgpu_shape_fill_stencil(state: &WgpuRenderState) -> WgpuStencilMode {
    if state.runtime.mask_write_mode {
        WgpuStencilMode::MaskWrite
    } else if state.runtime.current_mask_depth > 0 {
        WgpuStencilMode::Masked
    } else {
        WgpuStencilMode::Normal
    }
}

fn wgpu_shape_fill_pipeline_key(stencil: WgpuStencilMode, format: wgpu::TextureFormat) -> String {
    format!("shapefill-{}-{:?}", stencil.key(), format)
}

fn create_wgpu_shape_fill_pipeline(
    device: &wgpu::Device,
    runtime: &flighthq_render_wgpu::WgpuRenderStateRuntime,
    stencil: WgpuStencilMode,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("flight-wgpu-shape-fill-shader"),
        source: wgpu::ShaderSource::Wgsl(SHAPE_FILL_SHADER_SRC.into()),
    });
    // Reuse the shared uniform bind-group layout (group 0, dynamic-offset uniform).
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-shape-fill-pipeline-layout"),
        bind_group_layouts: &[&runtime.uniform_bind_group_layout],
        push_constant_ranges: &[],
    });
    let stencil_face = build_wgpu_stencil_face_state(stencil);
    let is_mask_write = stencil == WgpuStencilMode::MaskWrite;

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-wgpu-shape-fill-pipeline"),
        layout: Some(&layout),
        vertex: wgpu::VertexState {
            module: &module,
            entry_point: "vs_main",
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: 8,
                step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &[wgpu::VertexAttribute {
                    format: wgpu::VertexFormat::Float32x2,
                    offset: 0,
                    shader_location: 0,
                }],
            }],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &module,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(normal_wgpu_blend_state()),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth24PlusStencil8,
            depth_write_enabled: false,
            depth_compare: wgpu::CompareFunction::Always,
            stencil: wgpu::StencilState {
                front: stencil_face,
                back: stencil_face,
                read_mask: 0xff,
                write_mask: if is_mask_write { 0xff } else { 0x00 },
            },
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

// Uploads one tessellated path mesh into fresh GPU vertex/index buffers.
fn upload_wgpu_shape_mesh(state: &WgpuRenderState, mesh: &PathMesh, color: u32) -> WgpuShapeMesh {
    let vertex_bytes = f32_slice_bytes(&mesh.vertices);
    let index_bytes = u32_slice_bytes(&mesh.indices);

    let vertex_buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-shape-fill-vertices"),
        size: vertex_bytes.len() as u64,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let index_buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-shape-fill-indices"),
        size: index_bytes.len() as u64,
        usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    state.queue.write_buffer(&vertex_buffer, 0, vertex_bytes);
    state.queue.write_buffer(&index_buffer, 0, index_bytes);

    WgpuShapeMesh {
        vertex_buffer,
        index_buffer,
        index_count: mesh.indices.len() as u32,
        color,
    }
}

// Writes one solid-fill uniform slot (padded mat3x3 + vec4 color) into the shared
// ring buffer at the current offset and advances it. Returns the byte offset for
// use as the dynamic offset in set_bind_group.
fn write_wgpu_shape_fill_uniforms(
    state: &mut WgpuRenderState,
    transform: &Matrix,
    color: u32,
) -> u32 {
    let (vw, vh) = current_wgpu_shape_fill_viewport(state);
    let runtime = &mut state.runtime;
    let byte_offset = runtime.uniform_offset;
    let float_base = (byte_offset >> 2) as usize;

    set_wgpu_matrix_from_transform(&mut runtime.matrix_array, transform, vw, vh);
    let m = runtime.matrix_array;
    let d = &mut runtime.uniform_data;
    d[float_base] = m[0];
    d[float_base + 1] = m[1];
    d[float_base + 2] = m[2];
    d[float_base + 3] = 0.0;
    d[float_base + 4] = m[3];
    d[float_base + 5] = m[4];
    d[float_base + 6] = m[5];
    d[float_base + 7] = 0.0;
    d[float_base + 8] = m[6];
    d[float_base + 9] = m[7];
    d[float_base + 10] = m[8];
    d[float_base + 11] = 0.0;
    d[float_base + 12] = ((color >> 24) & 0xff) as f32 / 255.0;
    d[float_base + 13] = ((color >> 16) & 0xff) as f32 / 255.0;
    d[float_base + 14] = ((color >> 8) & 0xff) as f32 / 255.0;
    d[float_base + 15] = (color & 0xff) as f32 / 255.0;
    // Zero any trailing floats in the slot beyond the 16 we use (the ring stride
    // is at least UNIFORM_BYTE_SIZE, which is wider than this slot).
    let slot_floats = (UNIFORM_BYTE_SIZE / 4) as usize;
    for k in SHAPE_FILL_UNIFORM_FLOATS..slot_floats {
        d[float_base + k] = 0.0;
    }

    runtime.uniform_offset += runtime.uniform_stride;
    byte_offset as u32
}

fn current_wgpu_shape_fill_viewport(state: &WgpuRenderState) -> (u32, u32) {
    match state.runtime.render_target_viewport {
        Some(vp) => (vp.width.max(1), vp.height.max(1)),
        None => (state.surface_width.max(1), state.surface_height.max(1)),
    }
}

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    // SAFETY: f32 is plain-old-data; the slice covers len*4 in-bounds bytes.
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}

fn u32_slice_bytes(data: &[u32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    // SAFETY: u32 is plain-old-data; the slice covers len*4 in-bounds bytes.
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fold_region_color_full_alpha_passes_through() {
        assert_eq!(fold_region_color(0xff0000ff, 1.0), 0xff0000ff);
    }

    #[test]
    fn fold_region_color_half_alpha_scales_alpha_byte() {
        // 0xaa alpha * 0.5 ≈ 0x55, RGB untouched.
        assert_eq!(fold_region_color(0x102030aa, 0.5), 0x10203055);
    }

    #[test]
    fn wgpu_shape_fill_pipeline_key_distinguishes_stencil_and_format() {
        let a =
            wgpu_shape_fill_pipeline_key(WgpuStencilMode::Normal, wgpu::TextureFormat::Rgba8Unorm);
        let b =
            wgpu_shape_fill_pipeline_key(WgpuStencilMode::Masked, wgpu::TextureFormat::Rgba8Unorm);
        let c =
            wgpu_shape_fill_pipeline_key(WgpuStencilMode::Normal, wgpu::TextureFormat::Bgra8Unorm);
        assert_ne!(a, b);
        assert_ne!(a, c);
    }
}
