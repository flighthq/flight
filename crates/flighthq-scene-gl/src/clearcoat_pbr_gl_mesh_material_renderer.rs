//! The built-in Clearcoat (KHR_materials_clearcoat) forward-lit mesh-material
//! renderer.
//!
//! Ports `@flighthq/scene-gl` `clearcoatPbrGlMeshMaterialRenderer.ts`. Clearcoat
//! adds a second, always-dielectric GGX specular lobe (F0 = 0.04) over the base PBR
//! layer — the wet, lacquered highlight of car paint or varnish — with its own
//! clearcoat roughness, and attenuates the base layers by the clearcoat's Fresnel so
//! energy is conserved. `bind` composes the material's `standard` block through the
//! shared bind prologue and then uploads the clearcoat-specific scalars; the
//! clearcoat lobe lives behind `#define CLEARCOAT` in the one PBR uber-shader. The
//! clearcoat/roughness/normal maps are reserved by the descriptor but not yet
//! sampled here (scalar clearcoat is the current approximation).

use flighthq_render_gl::GlRenderState;
use flighthq_types::ClearcoatPbrMaterial;
use flighthq_types::camera::Camera;
use flighthq_types::kind::KindId;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_pbr_standard_bind::{bind_gl_pbr_mesh_common, build_gl_pbr_standard_define_key};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::standard_pbr_gl_mesh_material_renderer::draw_gl_pbr_mesh_subset;

/// The built-in Clearcoat forward-lit mesh-material renderer. See
/// [`register_clearcoat_pbr_gl_material`] to install it.
pub struct ClearcoatPbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for ClearcoatPbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let clearcoat = material.and_then(|m| m.as_clearcoat_pbr());
        let standard = clearcoat.map(|c| &c.standard);

        let mut key = build_gl_pbr_standard_define_key(
            standard,
            clearcoat.is_some_and(|c| c.alpha_mode == MaterialAlphaMode::Mask),
        );
        key.clearcoat_enabled = true;
        let program = bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            clearcoat.is_some_and(|c| c.double_sided),
            standard,
            clearcoat.map_or(0.5, |c| c.alpha_cutoff),
            lights,
            camera,
        );

        let gl = &state.gl;
        unsafe {
            gl.uniform_1_f32(
                program.loc_clearcoat.as_ref(),
                clearcoat.map_or(0.0, |c| c.clearcoat),
            );
            gl.uniform_1_f32(
                program.loc_clearcoat_roughness.as_ref(),
                clearcoat.map_or(0.0, |c| c.clearcoat_roughness),
            );
        }
    }

    fn draw(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &GlMeshUpload,
    ) {
        draw_gl_pbr_mesh_subset(state, scene, proxy, upload);
    }
}

/// Installs the built-in Clearcoat renderer for the Clearcoat material kind on this
/// scene runtime. Opt-in (no top-level side effect): `draw_gl_scene` only draws
/// Clearcoat subsets once this is called.
pub fn register_clearcoat_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<ClearcoatPbrMaterial>(),
        Box::new(ClearcoatPbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_clearcoat_pbr_gl_material

    #[test]
    fn register_clearcoat_pbr_gl_material_registers_for_the_clearcoat_kind() {
        let mut scene = create_gl_scene_runtime();
        register_clearcoat_pbr_gl_material(&mut scene);
        assert!(
            get_gl_mesh_material_renderer(&scene, KindId::of::<ClearcoatPbrMaterial>()).is_some()
        );
    }
}
