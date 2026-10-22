use flight_entity::Ref;
use flight_materials::anisotropy_pbr_extension::create_anisotropy_pbr_extension;
use flight_materials::{ANISOTROPY_PBR_EXTENSION_KIND, PbrExtension};
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

mod anisotropy_pbr_gl_extension {
    use super::*;

    #[test]
    fn contributes_independent_punctual_and_ibl_anisotropy_source() {
        let context = TestShaderContext { scene_color: false };
        let contribution = (ANISOTROPY_PBR_GL_EXTENSION.create_shader_contribution)(
            &context,
            &PbrExtension::Anisotropy(create_anisotropy_pbr_extension()),
        );
        assert!(
            contribution
                .contribute_punctual
                .contains("flightDistributionGgxAnisotropic")
        );
        assert!(
            contribution
                .contribute_punctual
                .contains("flightVisibilitySmithGgxAnisotropic")
        );
        assert!(
            contribution
                .contribute_punctual
                .contains("flightAnisotropyD * flightAnisotropyVis - d * vis")
        );
        assert!(
            contribution
                .fragment_functions
                .contains("1.0 + lambdaV + lambdaL")
        );
        assert!(
            contribution
                .contribute_ibl
                .contains("flightAnisotropyReflection")
        );
    }
}

mod register_gl_anisotropy_pbr_extension {
    use super::*;

    #[test]
    fn registers_only_the_anisotropy_extension_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_anisotropy_pbr_extension(&mut state);
        let registration =
            get_gl_pbr_extension_registration(&state, &ANISOTROPY_PBR_EXTENSION_KIND.to_string());
        assert!(
            registration.is_some_and(|registration| std::ptr::eq(
                registration,
                &ANISOTROPY_PBR_GL_EXTENSION
            ))
        );
    }
}
