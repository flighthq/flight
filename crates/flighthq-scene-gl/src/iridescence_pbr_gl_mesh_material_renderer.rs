//! The built-in Iridescence (KHR_materials_iridescence) forward-lit mesh-material
//! renderer.
//!
//! Ports `@flighthq/scene-gl` `iridescencePbrGlMeshMaterialRenderer.ts`. Iridescence
//! models a thin transparent film over the surface whose interference shifts the
//! Fresnel reflectance toward a view- and thickness-dependent hue — soap bubbles, oil
//! slicks, anodized metal. The shader applies a compact sinusoidal thin-film
//! approximation (sample-viewer style) to F0 behind `#define IRIDESCENCE`. `bind`
//! composes the material's `standard` block through the shared bind prologue and
//! uploads the iridescence strength, film IOR, and a single film thickness (the
//! midpoint of the descriptor's min/max nm range; the per-texel thickness map is
//! reserved but not yet sampled).

use flighthq_render_gl::GlRenderState;
use flighthq_types::IridescencePbrMaterial;
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

/// The built-in Iridescence forward-lit mesh-material renderer. See
/// [`register_iridescence_pbr_gl_material`] to install it.
pub struct IridescencePbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for IridescencePbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let iridescence = material.and_then(|m| m.as_iridescence_pbr());
        let standard = iridescence.map(|i| &i.standard);

        let mut key = build_gl_pbr_standard_define_key(
            standard,
            iridescence.is_some_and(|i| i.alpha_mode == MaterialAlphaMode::Mask),
        );
        key.iridescence_enabled = true;
        let program = bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            iridescence.is_some_and(|i| i.double_sided),
            standard,
            iridescence.map_or(0.5, |i| i.alpha_cutoff),
            lights,
            camera,
        );

        let gl = &state.gl;
        unsafe {
            if let Some(iridescence) = iridescence {
                let thickness = (iridescence.iridescence_thickness_min
                    + iridescence.iridescence_thickness_max)
                    * 0.5;
                gl.uniform_1_f32(program.loc_iridescence.as_ref(), iridescence.iridescence);
                gl.uniform_1_f32(
                    program.loc_iridescence_ior.as_ref(),
                    iridescence.iridescence_ior,
                );
                gl.uniform_1_f32(program.loc_iridescence_thickness.as_ref(), thickness);
            } else {
                gl.uniform_1_f32(program.loc_iridescence.as_ref(), 0.0);
                gl.uniform_1_f32(program.loc_iridescence_ior.as_ref(), 1.3);
                gl.uniform_1_f32(program.loc_iridescence_thickness.as_ref(), 250.0);
            }
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

/// Installs the built-in Iridescence renderer for the Iridescence material kind on
/// this scene runtime. Opt-in (no top-level side effect): `draw_gl_scene` only draws
/// Iridescence subsets once this is called.
pub fn register_iridescence_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<IridescencePbrMaterial>(),
        Box::new(IridescencePbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_iridescence_pbr_gl_material

    #[test]
    fn register_iridescence_pbr_gl_material_registers_for_the_iridescence_kind() {
        let mut scene = create_gl_scene_runtime();
        register_iridescence_pbr_gl_material(&mut scene);
        assert!(
            get_gl_mesh_material_renderer(&scene, KindId::of::<IridescencePbrMaterial>()).is_some()
        );
    }
}
