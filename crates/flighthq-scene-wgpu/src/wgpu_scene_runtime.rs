//! scene-wgpu's per-`WgpuRenderState` private state — the WGSL mirror of
//! `GlSceneRuntime`.
//!
//! Holds the 3D mesh-material registry, the StandardPbr pipeline cache (keyed by
//! define key + color-attachment format), the per-state geometry GPU-upload
//! cache, and the shared GPU resources the StandardPbr path reuses every frame
//! (the Frame uniform buffer + its bind group, the dynamic-offset Draw bind
//! group, the 1x1 placeholder map texture, and a per-material bind-group cache).
//!
//! In the TS port the registry + upload cache are surfaced through the header's
//! `WgpuRenderStateRuntime.sceneMeshMaterialRegistry` / `sceneMeshUploadCache`
//! slots (kept opaque there), and one `WgpuSceneRuntime` is created lazily per
//! state by `getWgpuSceneRuntime`.
//!
//! TODO(align): the Rust `flighthq-types` / `flighthq-render-wgpu` header does
//! not yet expose the scene-wgpu runtime slots on `WgpuRenderStateRuntime`, nor
//! the `WgpuMeshMaterialRenderer` trait, `StandardPbrMaterial`, `SceneRenderProxy`
//! or the `WgpuMeshUpload` GPU upload type. Until that seam lands these are local
//! compiling stubs; `get_wgpu_scene_runtime` cannot allocate per-state state
//! without a place to attach it.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_pbr_pipeline_cache::WgpuPbrPipeline;

/// scene-wgpu's per-state private runtime. Mutable by design: the draw path
/// writes the caches and shared bindings every frame.
///
/// TODO(align): fields that reference not-yet-ported header types
/// (`WgpuMeshMaterialRenderer`, the material-binding cache, `WgpuMeshUpload`) are
/// omitted here; this is the shape the seam will grow into.
pub struct WgpuSceneRuntime {
    pub active_pipeline: Option<WgpuPbrPipeline>,
    pub frame_buffer: Option<wgpu::Buffer>,
    pub frame_bind_group: Option<wgpu::BindGroup>,
    pub draw_bind_group: Option<wgpu::BindGroup>,
    pub placeholder_view: Option<wgpu::TextureView>,
    pub pending_draw_offset: u64,
    pub pipeline_cache: std::collections::HashMap<String, WgpuPbrPipeline>,
}

impl Default for WgpuSceneRuntime {
    fn default() -> Self {
        Self {
            active_pipeline: None,
            frame_buffer: None,
            frame_bind_group: None,
            draw_bind_group: None,
            placeholder_view: None,
            pending_draw_offset: 0,
            pipeline_cache: std::collections::HashMap::new(),
        }
    }
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

/// Resolves scene-wgpu's private runtime for a `WgpuRenderState`, allocating it
/// (and wiring the header runtime slots to its registry and upload cache) on
/// first use.
///
/// TODO(align): blocked on the scene-wgpu runtime slot seam in `flighthq-types`
/// (`WgpuRenderStateRuntime::scene_mesh_material_registry` /
/// `scene_mesh_upload_cache`). There is currently no per-state place to attach a
/// `WgpuSceneRuntime`.
pub fn get_wgpu_scene_runtime(_state: &mut WgpuRenderState) -> &mut WgpuSceneRuntime {
    todo!(
        "TODO(align): port getWgpuSceneRuntime — blocked on WgpuRenderStateRuntime \
         scene-wgpu runtime slots in flighthq-types"
    )
}
