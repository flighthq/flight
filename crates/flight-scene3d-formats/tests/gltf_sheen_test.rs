use crate::gltf_extension_test_helper::*;
use flight_materials::{EXTENDED_PBR_MATERIAL_KIND, PbrExtension};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::contract::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use serde_json::json;

mod gltf_sheen_extension_handler {
    use super::*;
    #[test]
    fn srgb_encodes_the_linear_sheen_color_factor_the_file_states() {
        let document = extension_gltf(
            "cloth.png",
            json!({"extensions":{"KHR_materials_sheen":{"sheenColorFactor":[0.5,0.25,0.125]}}}),
            &[GLTF_SHEEN_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Sheen(extension) = &*extension else {
            panic!("expected sheen");
        };
        assert_eq!(extension.sheen_color, packed_gltf_color(0.5, 0.25, 0.125));
        let document = document.read().unwrap();
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        assert_eq!(
            material.material.read().unwrap().material_fields().kind,
            EXTENDED_PBR_MATERIAL_KIND
        );
    }
    #[test]
    fn samples_the_color_map_as_srgb_and_the_roughness_map_as_linear() {
        let document = extension_gltf(
            "cloth.png",
            json!({"extensions":{"KHR_materials_sheen":{"sheenColorTexture":{"index":0},"sheenRoughnessFactor":0.6,"sheenRoughnessTexture":{"index":0}}}}),
            &[GLTF_SHEEN_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Sheen(extension) = &*extension else {
            panic!("expected sheen");
        };
        assert_eq!(
            extension
                .sheen_color_map
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture_fields()
                .color_space,
            TextureColorSpace::Srgb
        );
        assert_eq!(
            extension
                .sheen_roughness_map
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture_fields()
                .color_space,
            TextureColorSpace::Linear
        );
        assert_gltf_close(extension.sheen_roughness, 0.6);
    }
    #[test]
    fn takes_the_spec_default_of_no_sheen_for_an_empty_block() {
        let document = extension_gltf(
            "cloth.png",
            json!({"extensions":{"KHR_materials_sheen":{}}}),
            &[GLTF_SHEEN_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Sheen(extension) = &*extension else {
            panic!("expected sheen");
        };
        assert_eq!(extension.sheen_color, packed_gltf_color(0.0, 0.0, 0.0));
        assert_eq!(extension.sheen_roughness, 0.0);
    }
}
