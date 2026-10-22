//! The wireframe GPU upload (TS `wgpuWireframeUpload.ts`): the geometry's shared vertex buffer plus a
//! derived line-list index buffer (three edges per triangle), cached per state keyed by the geometry.

use flight_entity::get_entity_id;
use flight_meshgeometry::{IndexBuffer, MeshGeometry};
use flight_render_wgpu::{
    WgpuRenderState, create_wgpu_buffer, get_wgpu_render_state_native_device, write_wgpu_buffer,
};

use crate::types::*;
use crate::wgpu_mesh_upload::ensure_wgpu_mesh_upload;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

// Buffers written through the queue must be a multiple of 4 bytes; round the requested size up.
fn align_to_4(byte_length: u64) -> u64 {
    return (byte_length + 3) & !3;
}

// The line-list indices (two per triangle edge, three edges per triangle) from the triangle indices,
// or from a sequential range for non-indexed geometry, as little-endian bytes and their format;
// promoted to 32-bit when the source is 32-bit or the line count exceeds the 16-bit range.
fn build_line_indices(geometry: &MeshGeometry) -> (Vec<u8>, wgpu::IndexFormat) {
    let stride = geometry.layout.read().unwrap().stride;
    let (triangle_indices, source_is_u32): (Option<Vec<u32>>, bool) = match &geometry.indices {
        IndexBuffer::U16(indices) => (
            Some(
                indices
                    .data
                    .read()
                    .unwrap()
                    .iter()
                    .map(|&index| u32::from(index))
                    .collect(),
            ),
            false,
        ),
        IndexBuffer::U32(indices) => (Some(indices.data.read().unwrap().to_vec()), true),
        IndexBuffer::None => (None, false),
    };
    let triangle_count = match &triangle_indices {
        Some(indices) => indices.len() / 3,
        None if stride > 0 => geometry.vertices.len() * 4 / stride as usize / 3,
        None => 0,
    };
    let line_count = triangle_count * 6;
    let use_u32 = source_is_u32 || line_count > 65535;
    let mut lines = Vec::with_capacity(line_count);
    for triangle in 0..triangle_count {
        let base = triangle * 3;
        let (i0, i1, i2) = match &triangle_indices {
            Some(indices) => (indices[base], indices[base + 1], indices[base + 2]),
            None => (base as u32, base as u32 + 1, base as u32 + 2),
        };
        lines.extend_from_slice(&[i0, i1, i1, i2, i2, i0]);
    }
    if use_u32 {
        return (
            bytemuck::cast_slice(&lines).to_vec(),
            wgpu::IndexFormat::Uint32,
        );
    }
    let narrow: Vec<u16> = lines.iter().map(|&index| index as u16).collect();
    return (
        bytemuck::cast_slice(&narrow).to_vec(),
        wgpu::IndexFormat::Uint16,
    );
}

/// Lazily derives and uploads a geometry's line-index buffer for this state, reusing the triangle
/// upload's vertex buffer and re-deriving when `geometry.version` or that buffer changes (TS
/// `ensureWgpuWireframeUpload`). A subset's triangle range maps to the line range scaled by 2.
pub fn ensure_wgpu_wireframe_upload(
    state: &mut WgpuRenderState,
    geometry: &MeshGeometry,
    gpu_skinned: Option<bool>,
) -> Option<WgpuWireframeUpload> {
    let mesh_upload = ensure_wgpu_mesh_upload(state, geometry, Some(gpu_skinned.unwrap_or(false)));
    let key = get_entity_id(geometry);
    let previous = get_wgpu_scene3d_runtime(state)
        .wireframe_uploads
        .get(&key)
        .cloned();
    if let Some(upload) = &previous {
        if upload.version == geometry.version && upload.vertex_buffer == mesh_upload.vertex_buffer {
            return previous;
        }
        upload.line_index_buffer.destroy();
    }

    let native = get_wgpu_render_state_native_device(state);
    let (bytes, index_format) = build_line_indices(geometry);
    let line_index_buffer = create_wgpu_buffer(
        &native,
        align_to_4(bytes.len() as u64).max(4),
        wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
    );
    let mut padded = bytes;
    padded.resize(align_to_4(padded.len() as u64) as usize, 0);
    write_wgpu_buffer(&native, &line_index_buffer, 0, &padded);

    let upload = WgpuWireframeUpload {
        index_format,
        line_index_buffer,
        version: geometry.version,
        vertex_buffer: mesh_upload.vertex_buffer,
    };
    get_wgpu_scene3d_runtime(state)
        .wireframe_uploads
        .insert(key, upload.clone());
    return Some(upload);
}
