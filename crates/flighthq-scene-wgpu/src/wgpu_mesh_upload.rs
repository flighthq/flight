//! Lazy per-state GPU upload of a `MeshGeometry`'s interleaved vertex + index
//! buffers, cached by the geometry and re-uploaded when `geometry.version` moves.
//!
//! Ports `@flighthq/scene-wgpu` `wgpuMeshUpload.ts`. Returns `None` for
//! non-indexed geometry (this path draws indexed subsets only). The vertex layout
//! the pipeline binds (canonical 48-byte position/normal/tangent/uv0 record) is
//! fixed on the pipeline, not here.
//!
//! TS↔Rust divergence: the TS path keys a `WeakMap` by the geometry entity and
//! mirrors the upload onto `MeshGeometryRuntime.webgpuData` (so
//! `destroyMeshGeometryWgpuData` can null the slot). The Rust header keeps the GPU
//! upload slot on a separate `MeshGeometryRuntime` with no entity→runtime resolver
//! exposed, and the scene runtime is caller-owned (see `wgpu_scene_runtime`), so
//! the Rust port caches by an explicit stable `geometry_id` the caller supplies —
//! exactly like the sibling `flighthq-scene-gl`. // TODO(align): restore the
//! entity-keyed cache + `webgpu_data` mirror once the geometry↔runtime resolver
//! lands.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::mesh::{MeshGeometry, MeshIndices};

use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// Lazily uploads a `MeshGeometry`'s interleaved vertex buffer + index buffer
/// into GPU buffers for this `WgpuRenderState`, caching the result keyed by
/// `geometry_id`. Re-uploads when `geometry.version` moves past the cached
/// version, destroying and replacing the prior buffers. Returns `None` for
/// non-indexed geometry.
pub fn ensure_wgpu_mesh_upload<'a>(
    state: &WgpuRenderState,
    scene: &'a mut WgpuSceneRuntime,
    geometry_id: u64,
    geometry: &MeshGeometry,
) -> Option<&'a WgpuMeshUpload> {
    let indices = geometry.indices.as_ref()?;

    if scene
        .upload_cache
        .get(&geometry_id)
        .is_some_and(|upload| upload.version == geometry.version)
    {
        return scene.upload_cache.get(&geometry_id);
    }

    let device = &state.device;
    let queue = &state.queue;

    // Replace a stale upload's buffers: free the prior GPU resources now.
    if let Some(prior) = scene.upload_cache.remove(&geometry_id) {
        prior.vertex_buffer.destroy();
        if let Some(buffer) = prior.index_buffer {
            buffer.destroy();
        }
    }

    let vertex_bytes = f32_slice_bytes(&geometry.vertices);
    let vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-mesh-vertices"),
        size: align_to_4(vertex_bytes.len() as u64).max(4),
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&vertex_buffer, 0, vertex_bytes);

    let (index_bytes, index_count, index_format) = match indices {
        MeshIndices::U16(values) => (
            u16_slice_bytes(values),
            values.len() as u32,
            wgpu::IndexFormat::Uint16,
        ),
        MeshIndices::U32(values) => (
            u32_slice_bytes(values),
            values.len() as u32,
            wgpu::IndexFormat::Uint32,
        ),
    };
    let index_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-mesh-indices"),
        size: align_to_4(index_bytes.len() as u64).max(4),
        usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&index_buffer, 0, index_bytes);

    let upload = WgpuMeshUpload {
        index_buffer: Some(index_buffer),
        index_count,
        index_format,
        version: geometry.version,
        vertex_buffer,
    };
    scene.upload_cache.insert(geometry_id, upload);
    scene.upload_cache.get(&geometry_id)
}

/// GPU buffers written via `write_buffer` must be a multiple of 4 bytes; round the
/// requested size up. Pure arithmetic — faithfully ported and unit-tested.
pub fn align_to_4(byte_length: u64) -> u64 {
    (byte_length + 3) & !3
}

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    // SAFETY: f32 is plain-old-data; the slice covers len*4 in-bounds bytes.
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}

fn u16_slice_bytes(data: &[u16]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    // SAFETY: u16 is plain-old-data; the slice covers len*2 in-bounds bytes.
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

    mod align_to_4 {
        use super::*;

        #[test]
        fn rounds_up_to_a_multiple_of_four() {
            assert_eq!(align_to_4(0), 0);
            assert_eq!(align_to_4(1), 4);
            assert_eq!(align_to_4(3), 4);
            assert_eq!(align_to_4(4), 4);
            assert_eq!(align_to_4(5), 8);
            assert_eq!(align_to_4(12), 12);
            assert_eq!(align_to_4(13), 16);
        }
    }

    // ensure_wgpu_mesh_upload requires a live wgpu device for buffer creation, so
    // its upload path is validated functionally (the parity matrix at the `wgpu`
    // cell), matching `flighthq-render-wgpu`'s no-device test posture. The
    // pure-arithmetic helper above is unit-tested.
}
