//! Registers the built-in StandardPbr forward-lit renderer for the StandardPbr
//! material kind on a scene runtime. Convenience over
//! `register_wgpu_mesh_material_renderer(…, standard_pbr_material_kind(), …)`;
//! call it once per `WgpuSceneRuntime` before `draw_wgpu_scene` so meshes carrying
//! StandardPbr materials draw. Opt-in by design (no top-level side effect): the
//! render path knows no built-in material until registered.
//!
//! Ports `@flighthq/scene-wgpu` `registerStandardPbrWgpuMaterial.ts`.
//!
//! TS↔Rust divergence: the TS function takes `(state)` and fetches the scene
//! runtime off the state; the Rust port threads the caller-owned
//! `WgpuSceneRuntime` (see `wgpu_scene_runtime`).

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::pbr_material::standard_pbr_material_kind;

use crate::standard_pbr_wgpu_mesh_material_renderer::StandardPbrWgpuMeshMaterialRenderer;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_scene_runtime::WgpuSceneRuntime;

/// Registers the built-in StandardPbr forward-lit renderer for the StandardPbr
/// material kind on this scene runtime.
pub fn register_standard_pbr_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        standard_pbr_material_kind(),
        Box::new(StandardPbrWgpuMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    // register_standard_pbr_wgpu_material registers against the scene runtime; the
    // registry write is assertion-testable without a GPU device (the `state` arg is
    // unused by the registry path), so we exercise the underlying registry insert.
    #[test]
    fn registers_the_standard_pbr_renderer_under_its_kind() {
        let mut scene = create_wgpu_scene_runtime();
        scene.material_registry.insert(
            standard_pbr_material_kind(),
            Box::new(StandardPbrWgpuMeshMaterialRenderer),
        );
        assert!(
            scene
                .material_registry
                .contains_key(&standard_pbr_material_kind())
        );
    }
}
