//! Lazy GPU upload of a mesh geometry's vertex and index buffers (TS `wgpuMeshUpload.ts`), cached
//! per device in the device tier's scene-mesh upload cache keyed by the geometry's entity id.

use flight_entity::get_entity_id;
use flight_meshgeometry::{IndexBuffer, MeshGeometry};
use flight_render_wgpu::{
    WgpuMeshUpload, WgpuRenderState, create_wgpu_buffer, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, write_wgpu_buffer,
};

use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

// Buffers written through the queue must be a multiple of 4 bytes; round the requested size up.
fn align_to_4(byte_length: u64) -> u64 {
    return (byte_length + 3) & !3;
}

/// Uploads a geometry's interleaved vertex buffer and index buffer for this state's device, caching
/// the upload by geometry and re-uploading when `geometry.version` moves (TS
/// `ensureWgpuMeshUpload`). A GPU-skinned geometry with a captured bind pose uploads its bind-pose
/// vertices once. Non-indexed geometry uploads too: no index buffer, and `index_count` carries the
/// vertex count.
pub fn ensure_wgpu_mesh_upload(
    state: &mut WgpuRenderState,
    geometry: &MeshGeometry,
    gpu_skinned: Option<bool>,
) -> WgpuMeshUpload {
    let gpu_skinned = gpu_skinned.unwrap_or(false);
    let skinning = get_wgpu_scene3d_runtime(state).skinning_adapter;
    let context = get_wgpu_render_state_runtime(state).context.clone();
    let key = get_entity_id(geometry);
    let has_skin_bind_pose =
        gpu_skinned && skinning.is_some_and(|skinning| (skinning.has_bind_pose)(geometry));
    let previous = context
        .read()
        .unwrap()
        .scene_mesh_upload_cache
        .as_ref()
        .and_then(|cache| cache.get(&key).cloned());
    if let Some(upload) = &previous {
        let current = if has_skin_bind_pose {
            upload.skin_bind_uploaded == Some(true)
        } else {
            upload.version == geometry.version
        };
        if current {
            return upload.clone();
        }
        upload.vertex_buffer.destroy();
        if let Some(index_buffer) = &upload.index_buffer {
            index_buffer.destroy();
        }
    }

    let native = get_wgpu_render_state_native_device(state);
    let skinned_vertices = if has_skin_bind_pose {
        skinning.and_then(|skinning| (skinning.get_upload_vertices)(geometry))
    } else {
        None
    };
    let vertices: &[f32] = match &skinned_vertices {
        Some(vertices) => vertices,
        None => &geometry.vertices,
    };
    let vertex_bytes: &[u8] = bytemuck::cast_slice(vertices);
    let vertex_buffer = create_wgpu_buffer(
        &native,
        align_to_4(vertex_bytes.len() as u64).max(4),
        wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
    );
    write_wgpu_buffer(&native, &vertex_buffer, 0, vertex_bytes);

    let mut index_buffer = None;
    let mut index_format = None;
    let index_count = match &geometry.indices {
        IndexBuffer::U16(indices) => {
            let indices = indices.data.read().unwrap();
            let bytes: &[u8] = bytemuck::cast_slice(&indices);
            let buffer = create_wgpu_buffer(
                &native,
                align_to_4(bytes.len() as u64).max(4),
                wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
            );
            write_mesh_indices(&native, &buffer, bytes);
            index_buffer = Some(buffer);
            index_format = Some(wgpu::IndexFormat::Uint16);
            indices.len() as u32
        }
        IndexBuffer::U32(indices) => {
            let indices = indices.data.read().unwrap();
            let bytes: &[u8] = bytemuck::cast_slice(&indices);
            let buffer = create_wgpu_buffer(
                &native,
                align_to_4(bytes.len() as u64).max(4),
                wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
            );
            write_mesh_indices(&native, &buffer, bytes);
            index_buffer = Some(buffer);
            index_format = Some(wgpu::IndexFormat::Uint32);
            indices.len() as u32
        }
        IndexBuffer::None => {
            let stride = geometry.layout.read().unwrap().stride;
            if stride > 0 {
                (vertex_bytes.len() as u32) / stride
            } else {
                0
            }
        }
    };

    let upload = WgpuMeshUpload {
        index_buffer,
        index_count,
        index_format,
        skin_bind_uploaded: Some(has_skin_bind_pose),
        version: geometry.version,
        vertex_buffer,
    };
    context
        .write()
        .unwrap()
        .scene_mesh_upload_cache
        .get_or_insert_with(Default::default)
        .insert(key, upload.clone());
    return upload;
}

// A 16-bit index array with an odd element count occupies 2 mod 4 bytes, which the queue rejects:
// pad only that upload. `index_count` stays the source length, so the trailing word is padding rather
// than a drawn index.
fn write_mesh_indices(
    native: &flight_render_wgpu::WgpuNativeDevice,
    index_buffer: &wgpu::Buffer,
    bytes: &[u8],
) {
    if bytes.len() & 3 == 0 {
        write_wgpu_buffer(native, index_buffer, 0, bytes);
        return;
    }
    let mut padded = bytes.to_vec();
    padded.resize(align_to_4(bytes.len() as u64) as usize, 0);
    write_wgpu_buffer(native, index_buffer, 0, &padded);
}
