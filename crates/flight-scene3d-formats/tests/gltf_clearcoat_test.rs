use crate::gltf_extension_test_helper::*;
use flight_materials::{EXTENDED_PBR_MATERIAL_KIND, PbrExtension};
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::contract::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use serde_json::json;

mod gltf_clearcoat_extension_handler {
    use super::*;
    #[test]
    fn attaches_a_clearcoat_extension_carrying_the_files_factors() {
        let document = extension_gltf(
            "coat.png",
            json!({"extensions":{"KHR_materials_clearcoat":{"clearcoatFactor":0.8,"clearcoatRoughnessFactor":0.2}}}),
            &[GLTF_CLEARCOAT_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Clearcoat(extension) = &*extension else {
            panic!("expected clearcoat");
        };
        assert_gltf_close(extension.clearcoat, 0.8);
        assert_gltf_close(extension.clearcoat_roughness, 0.2);
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
    fn resolves_the_clearcoat_textures_as_linear_data() {
        let document = extension_gltf(
            "coat.png",
            json!({"extensions":{"KHR_materials_clearcoat":{"clearcoatNormalTexture":{"index":0,"scale":0.5},"clearcoatRoughnessTexture":{"index":0},"clearcoatTexture":{"index":0}}}}),
            &[GLTF_CLEARCOAT_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Clearcoat(extension) = &*extension else {
            panic!("expected clearcoat");
        };
        assert_eq!(
            extension
                .clearcoat_map
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
                .clearcoat_roughness_map
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
                .clearcoat_normal_map
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .texture_fields()
                .color_space,
            TextureColorSpace::Linear
        );
        assert_gltf_close(extension.clearcoat_normal_scale, 0.5);
        assert!(!document.read().unwrap().resources.is_empty());
    }
    #[test]
    fn takes_the_spec_defaults_for_an_extension_block_stating_nothing() {
        let document = extension_gltf(
            "coat.png",
            json!({"extensions":{"KHR_materials_clearcoat":{}}}),
            &[GLTF_CLEARCOAT_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::Clearcoat(extension) = &*extension else {
            panic!("expected clearcoat");
        };
        assert_eq!(extension.clearcoat, 0.0);
        assert_eq!(extension.clearcoat_roughness, 0.0);
    }
    #[test]
    fn leaves_a_material_with_no_clearcoat_block_on_the_standard_lane() {
        let document = extension_gltf(
            "coat.png",
            json!({"pbrMetallicRoughness":{"roughness":1}}),
            &[GLTF_CLEARCOAT_EXTENSION_HANDLER.clone()],
        );
        let document = document.read().unwrap();
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        assert_eq!(
            material.material.read().unwrap().material_fields().kind,
            flight_materials::STANDARD_PBR_MATERIAL_KIND
        );
    }
}
