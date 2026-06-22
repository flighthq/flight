//! scene-gl's per-`GlRenderState` private state.
//!
//! Ports `@flighthq/scene-gl` `glSceneRuntime.ts`. Holds the 3D mesh-material
//! registry, the StandardPbr program cache (keyed by define key), and the
//! per-state geometry GPU-upload cache. These are scene-gl-owned, distinct from
//! the 2D renderer's material/texture caches — a material kind is either 2D or
//! 3D, never both.
//!
//! TS↔Rust divergence: the TS package surfaces this runtime through the header's
//! opaque `GlRenderStateRuntime.sceneMeshMaterialRegistry` / `sceneMeshUploadCache`
//! slots and stores one `GlSceneRuntime` per state in a `WeakMap` keyed by the
//! `GlRenderState`. The Rust `GlRenderStateRuntime` (in `flighthq-render-gl`) does
//! not yet carry those scene slots, and a `WeakMap`-by-identity has no clean Rust
//! analog. So the Rust port keeps `GlSceneRuntime` as a standalone struct the
//! caller owns (the same idiom `flighthq-render-gl` uses for its registry tests),
//! threaded explicitly into the registry and draw functions rather than fetched
//! off the state. // TODO(align): wire scene slots onto `GlRenderStateRuntime`
//! once the header grows them, then restore the `get_gl_scene_runtime(state)`
//! seam.

use std::collections::HashMap;

use flighthq_types::kind::KindId;

use crate::gl_mesh_material_registry::GlMeshMaterialRenderer;
use crate::gl_pbr_program_cache::GlPbrProgram;

/// The GPU upload of one `MeshGeometry` for one `GlRenderState`: a VAO binding the
/// interleaved vertex buffer and index buffer, the element type/count for indexed
/// draws, and the geometry `version` the buffers were uploaded at (so a bumped
/// version forces a re-upload).
///
/// // TODO(align): the concrete GL object handles (`glow::VertexArray`,
/// `glow::Buffer`) are filled by `ensure_gl_mesh_upload`. The `version` and
/// `index_*` shape fields are portable and used by the draw path; the handles are
/// `Option` so the upload struct can be constructed and cache-tested without a GL
/// device, mirroring `flighthq-render-gl`'s no-device registry tests.
#[derive(Debug, Default)]
pub struct GlMeshUpload {
    pub index_buffer: Option<glow::Buffer>,
    pub index_count: u32,
    pub index_type: u32,
    pub vao: Option<glow::VertexArray>,
    pub version: i64,
    pub vertex_buffer: Option<glow::Buffer>,
}

/// scene-gl's per-state private runtime. One is created per `GlRenderState` and
/// owned by the caller (see the module-level divergence note).
#[derive(Default)]
pub struct GlSceneRuntime {
    pub active_pbr_program: Option<GlPbrProgram>,
    pub material_registry: HashMap<KindId, Box<dyn GlMeshMaterialRenderer>>,
    pub pbr_program_cache: HashMap<String, GlPbrProgram>,
    /// Geometry upload cache, keyed by a stable geometry identity (the geometry's
    /// arena/entity id). The TS port keys a `WeakMap` by the geometry entity; the
    /// Rust port keys by an explicit `u64` id the caller supplies.
    pub upload_cache: HashMap<u64, GlMeshUpload>,
}

/// Allocates a fresh, empty scene runtime. Mutable by design: the draw path
/// writes the caches every frame.
pub fn create_gl_scene_runtime() -> GlSceneRuntime {
    GlSceneRuntime::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_gl_scene_runtime

    #[test]
    fn create_gl_scene_runtime_starts_empty_with_no_active_program() {
        let runtime = create_gl_scene_runtime();
        assert!(runtime.material_registry.is_empty());
        assert!(runtime.pbr_program_cache.is_empty());
        assert!(runtime.upload_cache.is_empty());
        assert!(runtime.active_pbr_program.is_none());
    }
}
