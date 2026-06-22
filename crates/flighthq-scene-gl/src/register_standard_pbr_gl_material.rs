//! Registration of the standard PBR mesh-material renderer for WebGL2.
//!
//! Ports `@flighthq/scene-gl` `registerStandardPbrGlMaterial.ts`.
//!
//! TS↔Rust divergence: the TS function takes a `GlRenderState` and fetches the
//! scene runtime off it. The Rust port registers into a caller-owned
//! `GlSceneRuntime` (see `gl_scene_runtime` for why).

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_scene_runtime::GlSceneRuntime;
use crate::standard_pbr_gl_mesh_material_renderer::{
    StandardPbrGlMeshMaterialRenderer, standard_pbr_material_kind,
};

/// Registers the built-in StandardPbr forward-lit renderer for the StandardPbr
/// material kind on this scene runtime. Convenience over
/// [`register_gl_mesh_material_renderer`]; call it once per scene runtime before
/// [`draw_gl_scene`](crate::draw_gl_scene) so meshes carrying StandardPbr
/// materials draw. Opt-in by design (no module-load side effect): the render path
/// knows no built-in material until registered.
pub fn register_standard_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        standard_pbr_material_kind(),
        Box::new(StandardPbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_standard_pbr_gl_material

    #[test]
    fn register_standard_pbr_gl_material_registers_for_the_standard_pbr_kind() {
        let mut scene = create_gl_scene_runtime();
        register_standard_pbr_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, standard_pbr_material_kind()).is_some());
    }
}
