//! Lazy per-state GPU upload of a `MeshGeometry`'s interleaved vertex + index
//! buffers, cached by the geometry and re-uploaded when `geometry.version` moves.
//!
//! Returns `None` for non-indexed geometry (this path draws indexed subsets
//! only). The cached upload is also mirrored onto `MeshGeometryRuntime.webgpuData`
//! so `destroyMeshGeometryWgpuData` can null the slot. The vertex layout the
//! pipeline binds (canonical 48-byte position/normal/tangent/uv0 record) is fixed
//! on the pipeline, not here.
//!
//! TODO(align): blocked on the scene-wgpu per-state upload-cache slot and the
//! geometry↔runtime pairing the TS path uses (`geometry[EntityRuntimeKey]`). The
//! Rust `flighthq-mesh` keeps the GPU upload slot on a separate
//! `MeshGeometryRuntime` with no entity→runtime resolver exposed yet, and the
//! scene-wgpu runtime has no cache slot. Compiling stub until that seam lands.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::mesh::MeshGeometry;

use crate::wgpu_scene_runtime::WgpuMeshUpload;

/// Lazily uploads a `MeshGeometry`'s interleaved vertex buffer + index buffer
/// into GPU buffers for this `WgpuRenderState`, caching the result keyed by the
/// geometry. Re-uploads when `geometry.version` moves past the cached version,
/// destroying and replacing the prior buffers. Returns `None` for non-indexed
/// geometry.
///
/// TODO(align): port `ensureWgpuMeshUpload` once the scene-wgpu upload-cache slot
/// and the geometry→runtime resolver exist. Writes must align each buffer up to a
/// multiple of 4 bytes and mirror the upload onto `MeshGeometryRuntime.webgpu_data`.
pub fn ensure_wgpu_mesh_upload<'a>(
    _state: &'a mut WgpuRenderState,
    _geometry: &MeshGeometry,
) -> Option<&'a WgpuMeshUpload> {
    todo!(
        "TODO(align): port ensureWgpuMeshUpload — blocked on scene-wgpu upload-cache \
         slot + geometry→runtime resolver in flighthq-types/flighthq-mesh"
    )
}

/// GPU buffers written via `write_buffer` must be a multiple of 4 bytes; round the
/// requested size up. Pure arithmetic — faithfully ported and unit-tested.
pub fn align_to_4(byte_length: u64) -> u64 {
    (byte_length + 3) & !3
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
}
