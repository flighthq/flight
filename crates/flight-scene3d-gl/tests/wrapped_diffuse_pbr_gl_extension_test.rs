use flight_entity::Ref;
use flight_materials::wrapped_diffuse_pbr_extension::create_wrapped_diffuse_pbr_extension;
use flight_materials::{PbrExtension, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND};
use flight_render_gl::GlPbrExtensionShaderContext;
use flight_scene3d_gl::*;
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

mod register_gl_wrapped_diffuse_pbr_extension {
    use super::*;

    #[test]
    fn registers_the_honestly_named_wrapped_diffuse_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_wrapped_diffuse_pbr_extension(&mut state);
        let registration = get_gl_pbr_extension_registration(
            &state,
            &WRAPPED_DIFFUSE_PBR_EXTENSION_KIND.to_string(),
        );
        assert!(registration.is_some_and(|registration| std::ptr::eq(
            registration,
            &WRAPPED_DIFFUSE_PBR_GL_EXTENSION
        )));
    }
}

mod wrapped_diffuse_pbr_gl_extension {
    use super::*;

    #[test]
    fn contributes_wrapped_diffuse_to_punctual_and_ibl_lighting() {
        let context = TestShaderContext { scene_color: false };
        let contribution = (WRAPPED_DIFFUSE_PBR_GL_EXTENSION.create_shader_contribution)(
            &context,
            &PbrExtension::WrappedDiffuse(create_wrapped_diffuse_pbr_extension()),
        );
        assert!(contribution.contribute_punctual.contains("flightWrap"));
        assert!(
            contribution
                .contribute_ibl
                .contains("flightWrappedIblStrength")
        );
    }
}
