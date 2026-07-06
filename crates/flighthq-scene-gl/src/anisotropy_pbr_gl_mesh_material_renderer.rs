//! The built-in Anisotropy (KHR_materials_anisotropy) forward-lit mesh-material
//! renderer.
//!
//! Ports `@flighthq/scene-gl` `anisotropyPbrGlMeshMaterialRenderer.ts`. Anisotropy
//! stretches the specular highlight along the mesh tangent direction — brushed
//! metal, hair, vinyl — by splitting roughness into along-tangent and across-tangent
//! axes and evaluating an anisotropic GGX distribution (Burley) in the shader's
//! rotated tangent frame. It REQUIRES mesh tangents, which the PBR vertex record
//! already carries (location 2). `bind` composes the material's `standard` block
//! through the shared bind prologue and uploads the anisotropy strength + rotation;
//! the lobe lives behind `#define ANISOTROPY` in the PBR uber-shader. The anisotropy
//! direction map is reserved by the descriptor but not yet sampled here.

use flighthq_render_gl::GlRenderState;
use flighthq_types::AnisotropyPbrMaterial;
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

/// The built-in Anisotropy forward-lit mesh-material renderer. See
/// [`register_anisotropy_pbr_gl_material`] to install it.
pub struct AnisotropyPbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for AnisotropyPbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let anisotropy = material.and_then(|m| m.as_anisotropy_pbr());
        let standard = anisotropy.map(|a| &a.standard);

        let mut key = build_gl_pbr_standard_define_key(
            standard,
            anisotropy.is_some_and(|a| a.alpha_mode == MaterialAlphaMode::Mask),
        );
        key.anisotropy_enabled = true;
        let program = bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            anisotropy.is_some_and(|a| a.double_sided),
            standard,
            anisotropy.map_or(0.5, |a| a.alpha_cutoff),
            lights,
            camera,
        );

        let gl = &state.gl;
        unsafe {
            gl.uniform_1_f32(
                program.loc_anisotropy_strength.as_ref(),
                anisotropy.map_or(0.0, |a| a.anisotropy_strength),
            );
            gl.uniform_1_f32(
                program.loc_anisotropy_rotation.as_ref(),
                anisotropy.map_or(0.0, |a| a.anisotropy_rotation),
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

/// Installs the built-in Anisotropy renderer for the Anisotropy material kind on this
/// scene runtime. Opt-in (no top-level side effect): `draw_gl_scene` only draws
/// Anisotropy subsets once this is called.
pub fn register_anisotropy_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<AnisotropyPbrMaterial>(),
        Box::new(AnisotropyPbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_anisotropy_pbr_gl_material

    #[test]
    fn register_anisotropy_pbr_gl_material_registers_for_the_anisotropy_kind() {
        let mut scene = create_gl_scene_runtime();
        register_anisotropy_pbr_gl_material(&mut scene);
        assert!(
            get_gl_mesh_material_renderer(&scene, KindId::of::<AnisotropyPbrMaterial>()).is_some()
        );
    }
}
