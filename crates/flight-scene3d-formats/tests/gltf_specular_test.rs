use crate::gltf_extension_test_helper::*;
use flight_materials::PbrExtension;
use flight_scene3d_formats::contract::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use serde_json::json;

mod gltf_specular_extension_handler {
    use super::*;
    #[test]
    fn imports_the_strength_and_srgb_encodes_the_linear_specular_color() {
        let document = extension_gltf(
            "spec.png",
            json!({"extensions":{"KHR_materials_specular":{"specularColorFactor":[0.2,0.4,0.6],"specularFactor":0.3}}}),
            &[GLTF_SPECULAR_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Specular(extension) = &*extension else {
            panic!("expected specular");
        };
        assert_gltf_close(extension.specular, 0.3);
        assert_eq!(extension.specular_color, packed_gltf_color(0.2, 0.4, 0.6));
    }
    #[test]
    fn splits_the_two_textures_by_color_space_because_they_split_by_channel() {
        let document = extension_gltf(
            "spec.png",
            json!({"extensions":{"KHR_materials_specular":{"specularColorTexture":{"index":0},"specularTexture":{"index":0}}}}),
            &[GLTF_SPECULAR_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Specular(extension) = &*extension else {
            panic!("expected specular");
        };
        assert_eq!(
            extension
                .specular_map
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture_fields()
                .color_space,
            TextureColorSpace::Linear
        );
        assert_eq!(
            extension
                .specular_color_map
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture_fields()
                .color_space,
            TextureColorSpace::Srgb
        );
    }
    #[test]
    fn defaults_both_factors_to_full() {
        let document = extension_gltf(
            "spec.png",
            json!({"extensions":{"KHR_materials_specular":{}}}),
            &[GLTF_SPECULAR_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Specular(extension) = &*extension else {
            panic!("expected specular");
        };
        assert_eq!(extension.specular, 1.0);
        assert_eq!(extension.specular_color, packed_gltf_color(1.0, 1.0, 1.0));
    }
}
