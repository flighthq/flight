//! The built-in TransmissionVolume (KHR_materials_transmission +
//! KHR_materials_volume) forward-lit mesh-material renderer for refractive,
//! see-through surfaces (glass, liquid).
//!
//! Ports `@flighthq/scene-gl` `transmissionVolumePbrGlMeshMaterialRenderer.ts`.
//!
//! APPROXIMATION (not physically refractive yet): a true transmission path needs the
//! Phase-5 opaque-scene-color capture pass to sample what lies behind the surface and
//! refract it through the surface IOR, with Beer-Lambert absorption over the volume
//! `thickness`. Until that pass exists, this renderer models transmission cheaply
//! behind `#define TRANSMISSION`: it attenuates the fragment's coverage (alpha) by the
//! `transmission` factor so the surface reads as translucent, and tints the lit
//! radiance by `attenuation_color`. The surface is therefore drawn as a tinted,
//! partially transparent lit shell rather than a refracting lens. `thickness`,
//! `attenuation_distance`, and `ior` are accepted on the material but only
//! `transmission`/`attenuation_color` drive the current shader.
//!
//! `bind` composes the material's `standard` block through the shared bind prologue
//! and uploads the transmission factor + linear-decoded attenuation color. The
//! transmission/thickness maps are reserved but not yet sampled.

use flighthq_render_gl::GlRenderState;
use flighthq_types::TransmissionVolumePbrMaterial;
use flighthq_types::camera::Camera;
use flighthq_types::kind::KindId;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_pbr_standard_bind::{
    bind_gl_pbr_mesh_common, build_gl_pbr_standard_define_key, unpack_color_to_linear,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::standard_pbr_gl_mesh_material_renderer::draw_gl_pbr_mesh_subset;

/// The built-in TransmissionVolume forward-lit mesh-material renderer. See
/// [`register_transmission_volume_pbr_gl_material`] to install it.
pub struct TransmissionVolumePbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for TransmissionVolumePbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let transmission = material.and_then(|m| m.as_transmission_volume_pbr());
        let standard = transmission.map(|t| &t.standard);

        let mut key = build_gl_pbr_standard_define_key(
            standard,
            transmission.is_some_and(|t| t.alpha_mode == MaterialAlphaMode::Mask),
        );
        key.transmission_enabled = true;
        let program = bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            transmission.is_some_and(|t| t.double_sided),
            standard,
            transmission.map_or(0.5, |t| t.alpha_cutoff),
            lights,
            camera,
        );

        let gl = &state.gl;
        unsafe {
            if let Some(transmission) = transmission {
                let color = unpack_color_to_linear(transmission.attenuation_color);
                gl.uniform_1_f32(program.loc_transmission.as_ref(), transmission.transmission);
                gl.uniform_3_f32(
                    program.loc_attenuation_color.as_ref(),
                    color[0],
                    color[1],
                    color[2],
                );
            } else {
                gl.uniform_1_f32(program.loc_transmission.as_ref(), 0.0);
                gl.uniform_3_f32(program.loc_attenuation_color.as_ref(), 1.0, 1.0, 1.0);
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

/// Installs the built-in TransmissionVolume renderer for the TransmissionVolume
/// material kind on this scene runtime. Opt-in (no top-level side effect):
/// `draw_gl_scene` only draws TransmissionVolume subsets once this is called.
pub fn register_transmission_volume_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<TransmissionVolumePbrMaterial>(),
        Box::new(TransmissionVolumePbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_transmission_volume_pbr_gl_material

    #[test]
    fn register_transmission_volume_pbr_gl_material_registers_for_the_transmission_kind() {
        let mut scene = create_gl_scene_runtime();
        register_transmission_volume_pbr_gl_material(&mut scene);
        let kind = KindId::of::<TransmissionVolumePbrMaterial>();
        assert!(get_gl_mesh_material_renderer(&scene, kind).is_some());
    }
}
