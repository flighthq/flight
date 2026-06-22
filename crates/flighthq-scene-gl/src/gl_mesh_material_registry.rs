//! The 3D mesh-material renderer registry.
//!
//! Ports `@flighthq/scene-gl` `glMeshMaterialRegistry.ts`. The 3D scene analog of
//! `flighthq-render-gl`'s 2D material registry; reads scene-gl's own per-state
//! registry (`GlSceneRuntime::material_registry`), distinct from the 2D
//! `material_renderers` map.
//!
//! TS↔Rust divergence: the TS functions take `(state: GlRenderState, …)` and
//! fetch the scene runtime off the state. The Rust port threads the
//! `GlSceneRuntime` explicitly (see `gl_scene_runtime` for why). Otherwise the
//! resolve semantics are 1:1 — by material kind, else the `DefaultMaterialKind`
//! renderer, else `None`.

use flighthq_render_gl::GlRenderState;
use flighthq_types::kind::KindId;
use flighthq_types::material::DefaultMaterialKind;

use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::scene_render_contract::{Camera, SceneLightBlock, SceneRenderProxy};

/// A 3D mesh-material renderer: it binds the shared per-run GPU state for a
/// material (program, camera, lights, material uniforms/textures) and then draws
/// individual mesh subsets under that bind.
///
/// Ports the TS `GlMeshMaterialRenderer` header interface (which does not yet
/// exist in the Rust `flighthq-types` header — // TODO(align): promote this trait
/// to `flighthq-types` once the 3D render contract lands there).
pub trait GlMeshMaterialRenderer: Send + Sync {
    /// Selects the program variant for `material`, uploads the shared camera +
    /// light + material state, and fixes depth/cull state for the run that
    /// follows. `material` is `None` when the subset resolved to the default-kind
    /// fallback with no concrete material.
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    );

    /// Uploads the geometry (lazily, cached by version) and issues the indexed
    /// draw over `proxy.subset`. `geometry_id` is the stable cache key for the
    /// geometry's GPU upload; `upload` is the resolved/created cache slot.
    fn draw(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &GlMeshUpload,
    );
}

/// A material a mesh-material renderer can read. Minimal local seam standing in
/// for the TS `Material`/`StandardPbrMaterial` surface, which is not yet ported
/// to the Rust `flighthq-materials` / `flighthq-types` crates.
///
/// // TODO(align): replace with the real `StandardPbrMaterial` reads once the PBR
/// material lands in `flighthq-materials`.
pub trait MeshMaterial: std::fmt::Debug + Send + Sync {
    /// The material's pipeline kind, the registry resolution key.
    fn kind(&self) -> KindId;
}

/// Returns the 3D mesh-material renderer registered for a kind on this scene
/// runtime, or `None`.
pub fn get_gl_mesh_material_renderer(
    scene: &GlSceneRuntime,
    kind: KindId,
) -> Option<&dyn GlMeshMaterialRenderer> {
    scene.material_registry.get(&kind).map(|r| r.as_ref())
}

/// Registers a 3D mesh-material renderer against a material kind on this scene
/// runtime. Opt-in: `draw_gl_scene` only draws subsets whose material kind (or
/// `DefaultMaterialKind`) has a renderer here. Insert replaces.
pub fn register_gl_mesh_material_renderer(
    scene: &mut GlSceneRuntime,
    kind: KindId,
    renderer: Box<dyn GlMeshMaterialRenderer>,
) {
    scene.material_registry.insert(kind, renderer);
}

/// Resolves a mesh subset's material to its registered 3D renderer: by the
/// material's kind, else the renderer registered for `DefaultMaterialKind`, else
/// `None`. `draw_gl_scene` skips a subset whose material resolves to `None` (no
/// built-in fallback — every material, including the default, enters only through
/// registration).
pub fn resolve_gl_mesh_material_renderer(
    scene: &GlSceneRuntime,
    material_kind: Option<KindId>,
) -> Option<&dyn GlMeshMaterialRenderer> {
    if let Some(kind) = material_kind {
        if let Some(renderer) = scene.material_registry.get(&kind) {
            return Some(renderer.as_ref());
        }
    }
    scene
        .material_registry
        .get(&KindId::of::<DefaultMaterialKind>())
        .map(|r| r.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // A no-op renderer used to assert registry identity by kind.
    struct TestRenderer;
    impl GlMeshMaterialRenderer for TestRenderer {
        fn bind(
            &self,
            _state: &mut GlRenderState,
            _scene: &mut GlSceneRuntime,
            _material: Option<&dyn MeshMaterial>,
            _lights: &SceneLightBlock,
            _camera: &Camera,
        ) {
        }
        fn draw(
            &self,
            _state: &mut GlRenderState,
            _scene: &mut GlSceneRuntime,
            _proxy: &SceneRenderProxy,
            _upload: &GlMeshUpload,
        ) {
        }
    }

    struct TestKind;

    fn test_kind() -> KindId {
        KindId::of::<TestKind>()
    }

    // get_gl_mesh_material_renderer

    #[test]
    fn get_gl_mesh_material_renderer_returns_none_when_nothing_registered() {
        let scene = create_gl_scene_runtime();
        assert!(get_gl_mesh_material_renderer(&scene, test_kind()).is_none());
    }

    // register_gl_mesh_material_renderer

    #[test]
    fn register_gl_mesh_material_renderer_registers_a_renderer_retrievable_by_kind() {
        let mut scene = create_gl_scene_runtime();
        register_gl_mesh_material_renderer(&mut scene, test_kind(), Box::new(TestRenderer));
        assert!(get_gl_mesh_material_renderer(&scene, test_kind()).is_some());
    }

    // resolve_gl_mesh_material_renderer

    #[test]
    fn resolve_gl_mesh_material_renderer_returns_none_without_a_registration() {
        let scene = create_gl_scene_runtime();
        assert!(resolve_gl_mesh_material_renderer(&scene, None).is_none());
        assert!(resolve_gl_mesh_material_renderer(&scene, Some(test_kind())).is_none());
    }

    #[test]
    fn resolve_gl_mesh_material_renderer_resolves_by_the_material_kind() {
        let mut scene = create_gl_scene_runtime();
        register_gl_mesh_material_renderer(&mut scene, test_kind(), Box::new(TestRenderer));
        assert!(resolve_gl_mesh_material_renderer(&scene, Some(test_kind())).is_some());
    }

    #[test]
    fn resolve_gl_mesh_material_renderer_falls_back_to_the_default_material_kind() {
        let mut scene = create_gl_scene_runtime();
        register_gl_mesh_material_renderer(
            &mut scene,
            KindId::of::<DefaultMaterialKind>(),
            Box::new(TestRenderer),
        );
        struct Other;
        assert!(resolve_gl_mesh_material_renderer(&scene, Some(KindId::of::<Other>())).is_some());
        assert!(resolve_gl_mesh_material_renderer(&scene, None).is_some());
    }
}
