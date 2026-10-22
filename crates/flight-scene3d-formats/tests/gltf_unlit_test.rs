use crate::gltf_extension_test_helper::*;
use flight_materials::{
    EXTENDED_PBR_MATERIAL_KIND, Material, Material3D, MaterialAlphaMode,
    STANDARD_PBR_MATERIAL_KIND, UNLIT_MATERIAL_KIND, UnlitMaterial,
};
use flight_scene3d_formats::contract::*;
use serde_json::json;

mod gltf_unlit_extension_handler {
    use super::*;

    #[test]
    fn replaces_the_material_with_an_unlit_one_carrying_the_base_color_across() {
        let document = extension_gltf(
            "albedo.png",
            json!({"extensions":{"KHR_materials_unlit":{}},"pbrMetallicRoughness":{"baseColorFactor":[1,0,0,1],"baseColorTexture":{"index":0}}}),
            &[GLTF_UNLIT_EXTENSION_HANDLER.clone()],
        );
        assert_eq!(gltf_material_kind(&document), UNLIT_MATERIAL_KIND);
        with_gltf_material::<UnlitMaterial>(&document, |material| {
            assert_eq!(material.base_color, 0xff0000ff);
            assert!(material.base_color_map.is_some());
        });
    }

    #[test]
    fn carries_the_alpha_state_across_which_unlit_still_needs() {
        let document = extension_gltf(
            "albedo.png",
            json!({"alphaCutoff":0.75,"alphaMode":"MASK","doubleSided":true,"extensions":{"KHR_materials_unlit":{}},"name":"Billboard"}),
            &[GLTF_UNLIT_EXTENSION_HANDLER.clone()],
        );
        with_gltf_material::<UnlitMaterial>(&document, |material| {
            assert_eq!(
                material.material_fields().name.as_deref(),
                Some("Billboard")
            );
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Mask
            );
            assert_gltf_close(material.material3d_fields().alpha_cutoff, 0.75);
            assert!(material.material3d_fields().double_sided);
        });
    }

    #[test]
    fn leaves_the_material_lit_when_the_handler_is_not_imported() {
        let document = extension_gltf(
            "albedo.png",
            json!({"extensions":{"KHR_materials_unlit":{}}}),
            &[],
        );
        assert_eq!(gltf_material_kind(&document), STANDARD_PBR_MATERIAL_KIND);
    }

    #[test]
    fn declines_a_material_another_handler_already_claimed() {
        let document = extension_gltf(
            "albedo.png",
            json!({"extensions":{"KHR_materials_clearcoat":{"clearcoatFactor":1},"KHR_materials_unlit":{}}}),
            &[
                GLTF_CLEARCOAT_EXTENSION_HANDLER.clone(),
                GLTF_UNLIT_EXTENSION_HANDLER.clone(),
            ],
        );
        assert_eq!(gltf_material_kind(&document), EXTENDED_PBR_MATERIAL_KIND);
    }
}
