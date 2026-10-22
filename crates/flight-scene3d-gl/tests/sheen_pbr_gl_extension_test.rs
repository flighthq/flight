use flight_entity::Ref;
use flight_materials::sheen_pbr_extension::create_sheen_pbr_extension;
use flight_materials::{PbrExtension, SHEEN_PBR_EXTENSION_KIND};
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

mod register_gl_sheen_pbr_extension {
    use super::*;

    #[test]
    fn registers_only_the_sheen_extension_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_sheen_pbr_extension(&mut state);
        let registration =
            get_gl_pbr_extension_registration(&state, &SHEEN_PBR_EXTENSION_KIND.to_string());
        assert!(
            registration
                .is_some_and(|registration| std::ptr::eq(registration, &SHEEN_PBR_GL_EXTENSION))
        );
    }
}

mod sheen_pbr_gl_extension {
    use super::*;

    #[test]
    fn contributes_charlie_sheen_to_punctual_and_ibl_lighting() {
        let context = TestShaderContext { scene_color: false };
        let contribution = (SHEEN_PBR_GL_EXTENSION.create_shader_contribution)(
            &context,
            &PbrExtension::Sheen(create_sheen_pbr_extension()),
        );
        assert!(
            contribution
                .contribute_punctual
                .contains("flightDistributionCharlie")
        );
        assert!(contribution.contribute_ibl.contains("u_iblPrefiltered"));
    }
}
