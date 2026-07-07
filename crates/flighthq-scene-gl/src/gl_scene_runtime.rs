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
use flighthq_types::{Matrix4, SceneLights};

use crate::gl_classic_prelude::GlClassicProgram;
use crate::gl_debug_prelude::GlDebugProgram;
use crate::gl_matcap_prelude::GlMatcapProgram;
use crate::gl_mesh_material_registry::GlMeshMaterialRenderer;
use crate::gl_mesh_program::GlMeshProgram;
use crate::gl_pbr_program_cache::GlPbrProgram;
use crate::gl_toon_prelude::GlToonProgram;
use crate::gl_unlit_prelude::GlUnlitProgram;
use crate::gl_wireframe_prelude::GlWireframeProgram;

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

/// The active directional shadow for this state, set by `draw_gl_scene_shadow_map` and read by
/// the lit bind so every lit family samples the same shadow map. `None` = no shadow this frame.
/// Mirrors the TS `GlSceneShadow` interface in `glSceneRuntime.ts`.
pub struct GlSceneShadow {
    /// Light view-projection (world → shadow clip).
    pub matrix: Matrix4,
    /// The sampleable depth shadow map texture.
    pub texture: glow::Texture,
    /// The framebuffer holding the depth attachment (owned here for cleanup).
    pub framebuffer: glow::Framebuffer,
}

/// The baked image-based-lighting set for this state, produced by `bake_environment_ibl` and read
/// by the PBR ambient bind so every PBR draw samples the same environment.
/// Mirrors the TS `GlSceneIbl` interface in `glSceneRuntime.ts`.
pub struct GlSceneIbl {
    /// The 2D BRDF integration LUT (split-sum approximation).
    pub brdf_lut: glow::Texture,
    /// Scales the environment's contribution.
    pub intensity: f32,
    /// Diffuse irradiance cubemap.
    pub irradiance_cube: glow::Texture,
    /// Roughness-mipped prefiltered specular cubemap.
    pub prefiltered_cube: glow::Texture,
    /// Number of mip levels in `prefiltered_cube`.
    pub prefiltered_mip_count: u32,
}

/// scene-gl's per-state private runtime. One is created per `GlRenderState` and
/// owned by the caller (see the module-level divergence note).
#[derive(Default)]
pub struct GlSceneRuntime {
    /// The bind()→draw() handoff: a family bind stores its selected base program
    /// here and the draw tail reads it back. Mirrors the TS `activeMeshProgram`.
    pub active_mesh_program: Option<GlMeshProgram>,
    pub active_pbr_program: Option<GlPbrProgram>,
    /// Compiled classic (Lambert/Phong/BlinnPhong) programs, keyed by define key.
    pub classic_program_cache: HashMap<String, GlClassicProgram>,
    /// Compiled debug (Depth/Normal) programs, keyed by define key.
    pub debug_program_cache: HashMap<String, GlDebugProgram>,
    /// Environment source cubemap GPU texture, shared between IBL bake and skybox draw.
    pub environment_source_cube: Option<glow::Texture>,
    /// Baked IBL state; `None` until `bake_environment_ibl` runs. Read by the lit bind.
    pub ibl: Option<GlSceneIbl>,
    /// Framebuffer for IBL bake passes.
    pub ibl_bake_framebuffer: Option<glow::Framebuffer>,
    /// Compiled matcap programs, keyed by define key.
    pub matcap_program_cache: HashMap<String, GlMatcapProgram>,
    pub material_registry: HashMap<KindId, Box<dyn GlMeshMaterialRenderer>>,
    pub pbr_program_cache: HashMap<String, GlPbrProgram>,
    /// The shared mesh-material base-program cache (family + define key). Mirrors
    /// the TS `programCache`; family caches above hold the full resolved programs.
    pub program_cache: HashMap<String, GlMeshProgram>,
    /// Active shadow state; `None` until `draw_gl_scene_shadow_map` runs. Read by the lit bind.
    pub shadow: Option<GlSceneShadow>,
    /// Compiled Toon programs, keyed by define key.
    pub toon_program_cache: HashMap<String, GlToonProgram>,
    /// Compiled unlit (Unlit/Emissive/VertexColor) programs, keyed by define key.
    pub unlit_program_cache: HashMap<String, GlUnlitProgram>,
    /// The compiled wireframe program (single key).
    pub wireframe_program_cache: HashMap<String, GlWireframeProgram>,
    /// Geometry upload cache, keyed by a stable geometry identity (the geometry's
    /// arena/entity id). The TS port keys a `WeakMap` by the geometry entity; the
    /// Rust port keys by an explicit `u64` id the caller supplies.
    pub upload_cache: HashMap<u64, GlMeshUpload>,
}

/// Cache for per-frame scene light block, threaded alongside `GlSceneRuntime`.
/// The TS pack lives in `bindGlMeshLightBlock`; the Rust equivalent is
/// `pack_scene_lights` in the lighting module.
pub struct GlSceneFrameState<'a> {
    pub runtime: &'a mut GlSceneRuntime,
    pub lights: SceneLights,
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
