use crate::gltf_extension_test_helper::*;
use flight_materials::PbrExtension;
use flight_scene3d_formats::contract::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use serde_json::json;

mod gltf_iridescence_extension_handler {
    use super::*;
    #[test]
    fn imports_the_factor_ior_and_nanometre_thickness_bounds() {
        let document = extension_gltf(
            "film.png",
            json!({"extensions":{"KHR_materials_iridescence":{"iridescenceFactor":0.8,"iridescenceIor":1.8,"iridescenceThicknessMaximum":900,"iridescenceThicknessMinimum":200}}}),
            &[GLTF_IRIDESCENCE_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Iridescence(extension) = &*extension else {
            panic!("expected iridescence");
        };
        assert_gltf_close(extension.iridescence, 0.8);
        assert_gltf_close(extension.iridescence_ior, 1.8);
        assert_eq!(extension.iridescence_thickness_min, 200.0);
        assert_eq!(extension.iridescence_thickness_max, 900.0);
    }
    #[test]
    fn keeps_both_thickness_bounds_even_when_a_thickness_texture_is_present() {
        let document = extension_gltf(
            "film.png",
            json!({"extensions":{"KHR_materials_iridescence":{"iridescenceThicknessTexture":{"index":0}}}}),
            &[GLTF_IRIDESCENCE_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Iridescence(extension) = &*extension else {
            panic!("expected iridescence");
        };
        assert_eq!(
            extension
                .iridescence_thickness_map
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture_fields()
                .color_space,
            TextureColorSpace::Linear
        );
        assert_eq!(extension.iridescence_thickness_min, 100.0);
        assert_eq!(extension.iridescence_thickness_max, 400.0);
    }
    #[test]
    fn takes_the_spec_defaults_for_an_empty_block() {
        let document = extension_gltf(
            "film.png",
            json!({"extensions":{"KHR_materials_iridescence":{}}}),
            &[GLTF_IRIDESCENCE_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Iridescence(extension) = &*extension else {
            panic!("expected iridescence");
        };
        assert_eq!(extension.iridescence, 0.0);
        assert_gltf_close(extension.iridescence_ior, 1.3);
    }
}
