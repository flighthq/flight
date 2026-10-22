use crate::gltf_extension_test_helper::*;
use flight_materials::PbrExtension;
use flight_scene3d_formats::contract::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use serde_json::json;

mod gltf_anisotropy_extension_handler {
    use super::*;
    #[test]
    fn imports_strength_rotation_and_the_linear_direction_strength_map() {
        let document = extension_gltf(
            "brushed.png",
            json!({"extensions":{"KHR_materials_anisotropy":{"anisotropyRotation":1.5,"anisotropyStrength":0.7,"anisotropyTexture":{"index":0}}}}),
            &[GLTF_ANISOTROPY_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Anisotropy(extension) = &*extension else {
            panic!("expected anisotropy");
        };
        assert_gltf_close(extension.anisotropy_strength, 0.7);
        assert_gltf_close(extension.anisotropy_rotation, 1.5);
        assert_eq!(
            extension
                .anisotropy_map
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture_fields()
                .color_space,
            TextureColorSpace::Linear
        );
    }
    #[test]
    fn takes_the_spec_default_of_no_anisotropy_for_an_empty_block() {
        let document = extension_gltf(
            "brushed.png",
            json!({"extensions":{"KHR_materials_anisotropy":{}}}),
            &[GLTF_ANISOTROPY_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Anisotropy(extension) = &*extension else {
            panic!("expected anisotropy");
        };
        assert_eq!(extension.anisotropy_strength, 0.0);
        assert_eq!(extension.anisotropy_rotation, 0.0);
    }
}
