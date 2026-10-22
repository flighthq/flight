use flight_entity::Ref;
use flight_materials::specular_pbr_extension::create_specular_pbr_extension;
use flight_materials::{PbrExtension, SPECULAR_PBR_EXTENSION_KIND};
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

mod register_gl_specular_pbr_extension {
    use super::*;

    #[test]
    fn registers_only_the_specular_extension_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_specular_pbr_extension(&mut state);
        let registration =
            get_gl_pbr_extension_registration(&state, &SPECULAR_PBR_EXTENSION_KIND.to_string());
        assert!(
            registration
                .is_some_and(|registration| std::ptr::eq(registration, &SPECULAR_PBR_GL_EXTENSION))
        );
    }
}

mod specular_pbr_gl_extension {
    use super::*;

    #[test]
    fn contributes_dielectric_f0_source() {
        let context = TestShaderContext { scene_color: false };
        let contribution = (SPECULAR_PBR_GL_EXTENSION.create_shader_contribution)(
            &context,
            &PbrExtension::Specular(create_specular_pbr_extension()),
        );
        assert!(contribution.apply_surface.contains("f0 = mix"));
    }
}
