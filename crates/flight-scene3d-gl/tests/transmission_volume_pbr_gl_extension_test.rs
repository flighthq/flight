use flight_entity::Ref;
use flight_materials::transmission_volume_pbr_extension::create_transmission_volume_pbr_extension;
use flight_materials::{PbrExtension, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND};
use flight_render_gl::GlPbrExtensionShaderContext;
use flight_scene3d_gl::contract::*;
use flight_texture::Texture;

use crate::gl_test_helper::make_gl_scene3d_state;

struct TestShaderContext {
    scene_color: bool,
}

impl GlPbrExtensionShaderContext for TestShaderContext {
    fn has_transmission_scene_color(&self) -> bool {
        return self.scene_color;
    }

    fn is_texture_ready(&self, _texture: Option<&Ref<Texture>>) -> bool {
        return false;
    }
}

mod register_gl_transmission_volume_pbr_extension {
    use super::*;

    #[test]
    fn registers_only_the_transmission_volume_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_transmission_volume_pbr_extension(&mut state);
        let registration = get_gl_pbr_extension_registration(
            &state,
            &TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string(),
        );
        assert!(registration.is_some_and(|registration| std::ptr::eq(
            registration,
            &TRANSMISSION_VOLUME_PBR_GL_EXTENSION
        )));
    }
}

mod transmission_volume_pbr_gl_extension {
    use super::*;

    #[test]
    fn contributes_projected_refraction_and_beer_lambert_absorption_when_scene_color_is_supplied() {
        let context = TestShaderContext { scene_color: true };
        let contribution = (TRANSMISSION_VOLUME_PBR_GL_EXTENSION.create_shader_contribution)(
            &context,
            &PbrExtension::TransmissionVolume(create_transmission_volume_pbr_extension()),
        );
        assert!(contribution.finalize.contains("refract"));
        assert!(contribution.finalize.contains("v_worldPosition"));
        assert!(
            contribution
                .finalize
                .contains("flightTransmissionAbsorption")
        );
    }
}
