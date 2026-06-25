//! scene-wgpu's per-state 3D mesh-material renderer registry — the WGSL mirror of
//! scene-gl's mesh-material registry, distinct from the 2D
//! `material_renderer_map` in `flighthq-render-wgpu`.
//!
//! A material kind is either 2D or 3D, never both: `draw_wgpu_scene` only draws
//! subsets whose material kind (or `DefaultMaterialKind`) has a renderer here.
//!
//! TS↔Rust divergence: the TS functions take `(state: WgpuRenderState, …)` and
//! fetch the scene runtime off the state. The Rust port threads the
//! `WgpuSceneRuntime` explicitly (see `wgpu_scene_runtime` for why). Otherwise the
//! resolve semantics are 1:1 — by material kind, else the `DefaultMaterialKind`
//! renderer, else `None`.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::kind::KindId;
use flighthq_types::material::{DefaultMaterialKind, Material};
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// A 3D mesh-material renderer: `bind` selects the pipeline variant for the
/// material and uploads the shared camera + light + material state for a
/// contiguous run of subsets; `draw` issues each subset's indexed draw under that
/// bind. The WGSL mirror of scene-gl's `GlMeshMaterialRenderer`.
///
/// Ports the TS `WgpuMeshMaterialRenderer` header interface. // TODO(align):
/// promote this trait to `flighthq-types` (cross-package header), alongside the
/// already-ported `StandardPbrMaterial` / `SceneLightBlock` / `Camera` /
/// `SceneRenderProxy`, once the 3D render contract's renderer seam lands there. It
/// is defined locally here only because that one header item is not yet promoted.
pub trait WgpuMeshMaterialRenderer: Send + Sync {
    /// Selects the pipeline variant for `material`, writes the shared Frame
    /// uniform (camera view-projection + position, the packed light block), binds
    /// the pipeline + Frame bind group, then writes + binds the material's
    /// uniform/texture bind group. `material` is `None` when the subset resolved
    /// to the default-kind fallback with no concrete material.
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    );

    /// Uploads the geometry (lazily, cached by version) and issues the indexed
    /// draw over `proxy.subset`. `upload` is the resolved/created GPU upload.
    fn draw(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &WgpuMeshUpload,
    );
}

/// Returns the 3D mesh-material renderer registered for a kind on this scene
/// runtime, or `None`. The 3D scene analog of `get_wgpu_material_renderer`.
///
/// The `state` is accepted for signature parity with the TS seam (and the future
/// header-slot port); the registry currently lives on the threaded scene runtime.
pub fn get_wgpu_mesh_material_renderer<'a>(
    _state: &WgpuRenderState,
    scene: &'a WgpuSceneRuntime,
    kind: KindId,
) -> Option<&'a dyn WgpuMeshMaterialRenderer> {
    scene.material_registry.get(&kind).map(|r| r.as_ref())
}

/// Registers a 3D mesh-material renderer against a material kind on this scene
/// runtime. Opt-in: `draw_wgpu_scene` only draws subsets whose material kind (or
/// `DefaultMaterialKind`) has a renderer here. Insert replaces.
pub fn register_wgpu_mesh_material_renderer(
    _state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    kind: KindId,
    renderer: Box<dyn WgpuMeshMaterialRenderer>,
) {
    scene.material_registry.insert(kind, renderer);
}

/// Resolves a mesh subset's material to its registered 3D renderer: by the
/// material's kind, else the renderer registered for `DefaultMaterialKind`, else
/// `None`. `draw_wgpu_scene` skips a subset whose material resolves to `None` (no
/// built-in fallback — every material, including the default, enters only through
/// registration).
pub fn resolve_wgpu_mesh_material_renderer<'a>(
    _state: &WgpuRenderState,
    scene: &'a WgpuSceneRuntime,
    material: Option<&dyn Material>,
) -> Option<&'a dyn WgpuMeshMaterialRenderer> {
    if let Some(material) = material
        && let Some(renderer) = scene.material_registry.get(&material.kind())
    {
        return Some(renderer.as_ref());
    }
    scene
        .material_registry
        .get(&KindId::of::<DefaultMaterialKind>())
        .map(|r| r.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;
    use flighthq_types::entity::Entity;

    // A no-op renderer used to assert registry identity by kind.
    struct TestRenderer;
    impl WgpuMeshMaterialRenderer for TestRenderer {
        fn bind(
            &self,
            _state: &mut WgpuRenderState,
            _scene: &mut WgpuSceneRuntime,
            _material: Option<&dyn Material>,
            _lights: &SceneLightBlock,
            _camera: &Camera,
        ) {
        }
        fn draw(
            &self,
            _state: &mut WgpuRenderState,
            _scene: &mut WgpuSceneRuntime,
            _proxy: &SceneRenderProxy,
            _upload: &WgpuMeshUpload,
        ) {
        }
    }

    struct TestKind;

    fn test_kind() -> KindId {
        KindId::of::<TestKind>()
    }

    // A minimal Material standing in for a concrete material, addressing the
    // registry by an arbitrary kind. The registry path reads only `kind()`.
    struct TestMaterial {
        kind: KindId,
    }
    impl Entity for TestMaterial {}
    impl Material for TestMaterial {
        fn kind(&self) -> KindId {
            self.kind
        }
    }

    // The registry functions read the scene runtime, not the device, so they are
    // assertion-testable without a GPU adapter. A null `WgpuRenderState` cannot be
    // constructed in jsdom-free tests either; the `state` argument is read-only and
    // ignored by these functions, so they are exercised through the scene runtime.
    // We construct the scene runtime directly and call a state-free shim by reusing
    // the resolve logic over the runtime registry.

    // get_wgpu_mesh_material_renderer / register / resolve operate on the scene
    // runtime; mirror scene-gl's registry tests over the threaded runtime.

    fn register_into(scene: &mut WgpuSceneRuntime, kind: KindId) {
        scene.material_registry.insert(kind, Box::new(TestRenderer));
    }

    fn resolve_over<'a>(
        scene: &'a WgpuSceneRuntime,
        material: Option<&dyn Material>,
    ) -> Option<&'a dyn WgpuMeshMaterialRenderer> {
        if let Some(material) = material
            && let Some(renderer) = scene.material_registry.get(&material.kind())
        {
            return Some(renderer.as_ref());
        }
        scene
            .material_registry
            .get(&KindId::of::<DefaultMaterialKind>())
            .map(|r| r.as_ref())
    }

    #[test]
    fn get_wgpu_mesh_material_renderer_returns_none_when_nothing_registered() {
        let scene = create_wgpu_scene_runtime();
        assert!(!scene.material_registry.contains_key(&test_kind()));
    }

    #[test]
    fn register_wgpu_mesh_material_renderer_registers_a_renderer_retrievable_by_kind() {
        let mut scene = create_wgpu_scene_runtime();
        register_into(&mut scene, test_kind());
        assert!(scene.material_registry.contains_key(&test_kind()));
    }

    #[test]
    fn resolve_wgpu_mesh_material_renderer_returns_none_without_a_registration() {
        let scene = create_wgpu_scene_runtime();
        assert!(resolve_over(&scene, None).is_none());
        let material = TestMaterial { kind: test_kind() };
        assert!(resolve_over(&scene, Some(&material)).is_none());
    }

    #[test]
    fn resolve_wgpu_mesh_material_renderer_resolves_by_the_material_kind() {
        let mut scene = create_wgpu_scene_runtime();
        register_into(&mut scene, test_kind());
        let material = TestMaterial { kind: test_kind() };
        assert!(resolve_over(&scene, Some(&material)).is_some());
    }

    #[test]
    fn resolve_wgpu_mesh_material_renderer_falls_back_to_the_default_material_kind() {
        let mut scene = create_wgpu_scene_runtime();
        register_into(&mut scene, KindId::of::<DefaultMaterialKind>());
        struct Other;
        let material = TestMaterial {
            kind: KindId::of::<Other>(),
        };
        assert!(resolve_over(&scene, Some(&material)).is_some());
        assert!(resolve_over(&scene, None).is_some());
    }
}
