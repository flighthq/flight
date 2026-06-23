//! scene-wgpu's per-`WgpuRenderState` private state — the WGSL mirror of
//! `GlSceneRuntime`.
//!
//! Holds the 3D mesh-material registry, the StandardPbr pipeline cache (keyed by
//! define key + color-attachment format), the per-state geometry GPU-upload
//! cache, and the shared GPU resources the StandardPbr path reuses every frame
//! (the Frame uniform buffer + its bind group, the dynamic-offset Draw bind
//! group, the 1x1 placeholder map texture, and a per-material bind-group cache).
//! All scene-wgpu-owned and distinct from the 2D renderer's
//! `material_renderer_map` / `texture_cache` — a material kind is either 2D or
//! 3D, never both.
//!
//! TS↔Rust divergence: the TS package surfaces this runtime through the header's
//! opaque `WgpuRenderStateRuntime.sceneMeshMaterialRegistry` /
//! `sceneMeshUploadCache` slots and stores one `WgpuSceneRuntime` per state in a
//! `WeakMap` keyed by the `WgpuRenderState`. The Rust `WgpuRenderStateRuntime`
//! (in `flighthq-render-wgpu`) does not carry those scene slots, and a
//! `WeakMap`-by-identity has no clean Rust analog; the hard parallel-safety rule
//! also forbids growing that header here. So — exactly like the sibling
//! `flighthq-scene-gl` — the Rust port keeps `WgpuSceneRuntime` as a standalone
//! struct the caller owns (created with [`create_wgpu_scene_runtime`]), threaded
//! explicitly into the registry, upload, pipeline, and draw functions rather than
//! fetched off the state. // TODO(align): wire scene slots onto
//! `WgpuRenderStateRuntime` once the header grows them, then restore the
//! `get_wgpu_scene_runtime(state)` seam.

use std::collections::HashMap;

use flighthq_types::kind::KindId;

use crate::wgpu_mesh_material_registry::WgpuMeshMaterialRenderer;
use crate::wgpu_pbr_pipeline_cache::WgpuPbrPipeline;

/// scene-wgpu's per-state private runtime. One is created per `WgpuRenderState`
/// and owned by the caller (see the module-level divergence note). Mutable by
/// design: the draw path writes the caches and shared bindings every frame.
#[derive(Default)]
pub struct WgpuSceneRuntime {
    /// The material kind bound by the last `bind`, keying [`Self::material_bind_groups`]
    /// for the following `draw`(s) to set at group(2).
    pub active_material_key: Option<KindId>,
    /// The pipeline-cache key of the pipeline bound by the last `bind`, resolved
    /// against [`Self::pipeline_cache`] by the following `draw`(s). The pipeline
    /// itself is not `Clone`, so the runtime references it by key, not by copy.
    pub active_pipeline_key: Option<String>,
    /// The reused Draw bind group (group(1)) wiring the render-state ring buffer
    /// at a dynamic offset. Allocated once for the active pipeline's draw layout.
    pub draw_bind_group: Option<wgpu::BindGroup>,
    /// The reused Frame bind group (group(0)) wiring [`Self::frame_buffer`].
    pub frame_bind_group: Option<wgpu::BindGroup>,
    /// The shared Frame uniform buffer (camera + packed light block), re-written
    /// each `bind`.
    pub frame_buffer: Option<wgpu::Buffer>,
    /// Per-material GPU binding cache (Material uniform buffer + bind group),
    /// keyed by the material's `KindId` (the Rust analog of the TS `WeakMap`
    /// keyed by the material reference / a fallback key for the default path).
    pub material_bind_groups: HashMap<KindId, WgpuMaterialBinding>,
    /// The 3D mesh-material renderer registry, keyed by material kind. Distinct
    /// from the 2D `material_renderer_map` on `WgpuRenderStateRuntime`.
    pub material_registry: HashMap<KindId, Box<dyn WgpuMeshMaterialRenderer>>,
    /// The ring-buffer byte offset the active Draw bind group is wired at; the
    /// renderer's `draw` advances and re-points it per draw.
    pub pending_draw_offset: u64,
    /// Compiled StandardPbr pipeline variants, keyed by
    /// [`build_wgpu_pbr_pipeline_cache_key`](crate::build_wgpu_pbr_pipeline_cache_key).
    pub pipeline_cache: HashMap<String, WgpuPbrPipeline>,
    /// The 1x1 opaque-white placeholder map texture view, bound in every map slot
    /// so the material bind-group layout matches the textured variant even though
    /// maps are not sampled on wgpu yet.
    pub placeholder_view: Option<wgpu::TextureView>,
    /// The opaque-white placeholder texture backing [`Self::placeholder_view`].
    pub placeholder_texture: Option<wgpu::Texture>,
    /// Geometry upload cache, keyed by a stable geometry identity (the geometry's
    /// arena/entity id). The TS port keys a `WeakMap` by the geometry entity; the
    /// Rust port keys by an explicit `u64` id the caller supplies.
    pub upload_cache: HashMap<u64, WgpuMeshUpload>,
}

/// One material's per-state GPU binding: the Material uniform buffer (re-written
/// each bind with the material's factors) and the bind group wiring it + the
/// placeholder maps to the pipeline's material bind-group layout.
pub struct WgpuMaterialBinding {
    pub bind_group: wgpu::BindGroup,
    pub buffer: wgpu::Buffer,
}

/// The GPU upload of one `MeshGeometry` for one `WgpuRenderState`: the
/// interleaved vertex buffer, the index buffer + its element format and count,
/// and the geometry `version` the buffers were uploaded at (so a bumped version
/// forces a re-upload).
pub struct WgpuMeshUpload {
    pub index_buffer: Option<wgpu::Buffer>,
    pub index_count: u32,
    pub index_format: wgpu::IndexFormat,
    pub version: u32,
    pub vertex_buffer: wgpu::Buffer,
}

/// Allocates a fresh, empty scene runtime. Mutable by design: the draw path
/// writes the caches and shared bindings every frame.
pub fn create_wgpu_scene_runtime() -> WgpuSceneRuntime {
    WgpuSceneRuntime::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_wgpu_scene_runtime

    #[test]
    fn create_wgpu_scene_runtime_starts_empty_with_no_active_pipeline() {
        let runtime = create_wgpu_scene_runtime();
        assert!(runtime.material_registry.is_empty());
        assert!(runtime.material_bind_groups.is_empty());
        assert!(runtime.pipeline_cache.is_empty());
        assert!(runtime.upload_cache.is_empty());
        assert!(runtime.active_pipeline_key.is_none());
        assert!(runtime.frame_buffer.is_none());
        assert!(runtime.placeholder_view.is_none());
        assert_eq!(runtime.pending_draw_offset, 0);
    }
}
