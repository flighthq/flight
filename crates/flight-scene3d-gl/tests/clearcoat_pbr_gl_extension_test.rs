use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_materials::clearcoat_pbr_extension::create_clearcoat_pbr_extension;
use flight_materials::{CLEARCOAT_PBR_EXTENSION_KIND, PbrExtension};
use flight_render_gl::GlPbrExtensionShaderContext;
use flight_scene3d_gl::contract::*;
use flight_texture::{Texture, create_texture_2d};

use crate::gl_test_helper::make_gl_scene3d_state;

// The shader-context facts a test hands a registration: only `ready` textures report pixels.
struct TestShaderContext {
    ready: Option<Ref<Texture>>,
}

impl GlPbrExtensionShaderContext for TestShaderContext {
    fn has_transmission_scene_color(&self) -> bool {
        return false;
    }

    fn is_texture_ready(&self, texture: Option<&Ref<Texture>>) -> bool {
        return match (texture, self.ready.as_ref()) {
            (Some(texture), Some(ready)) => Arc::ptr_eq(texture, ready),
            _ => false,
        };
    }
}

mod clearcoat_pbr_gl_extension {
    use super::*;

    #[test]
    fn contributes_energy_conserving_punctual_and_ibl_clearcoat_source() {
        let context = TestShaderContext { ready: None };
        let contribution = (CLEARCOAT_PBR_GL_EXTENSION.create_shader_contribution)(
            &context,
            &PbrExtension::Clearcoat(create_clearcoat_pbr_extension()),
        );
        assert!(
            contribution
                .contribute_punctual
                .contains("direct * (1.0 - flightClearcoatF)")
        );
        assert!(
            contribution
                .contribute_ibl
                .contains("ambient * (1.0 - flightClearcoatF)")
        );
    }

    #[test]
    fn keeps_the_clearcoat_normal_on_the_coat_lobe_in_both_lighting_paths() {
        let normal_map: Ref<Texture> =
            Arc::new(RwLock::new(Texture::Texture2D(create_texture_2d())));
        let mut extension = create_clearcoat_pbr_extension();
        extension.clearcoat_normal_map = Some(normal_map.clone());
        let context = TestShaderContext {
            ready: Some(normal_map),
        };
        let contribution = (CLEARCOAT_PBR_GL_EXTENSION.create_shader_contribution)(
            &context,
            &PbrExtension::Clearcoat(extension),
        );

        assert_eq!(contribution.apply_surface, "");
        assert!(
            contribution
                .fragment_functions
                .contains("vec3 flightClearcoatNormal(")
        );
        assert!(
            contribution
                .fragment_functions
                .contains("u_flightClearcoatNormalMapTransform")
        );
        assert!(
            contribution
                .contribute_punctual
                .contains("flightClearcoatNormal(N, tangentDir, bitangentDir)")
        );
        assert!(
            contribution
                .contribute_ibl
                .contains("flightClearcoatNormal(N, tangentDir, bitangentDir)")
        );
    }
}

mod register_gl_clearcoat_pbr_extension {
    use super::*;

    #[test]
    fn registers_only_the_clearcoat_extension_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_clearcoat_pbr_extension(&mut state);
        let registration =
            get_gl_pbr_extension_registration(&state, &CLEARCOAT_PBR_EXTENSION_KIND.to_string());
        assert!(
            registration.is_some_and(|registration| std::ptr::eq(
                registration,
                &CLEARCOAT_PBR_GL_EXTENSION
            ))
        );
    }
}
