use crate::gltf_extension_test_helper::*;
use flight_materials::{
    EXTENDED_PBR_MATERIAL_KIND, Material, Material3D, MaterialAlphaMode,
    SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND,
    SpecularGlossinessPbrMaterial,
};
use flight_scene3d_formats::contract::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use serde_json::json;

mod gltf_specular_glossiness_extension_handler {
    use super::*;

    #[test]
    fn replaces_the_material_with_the_specular_glossiness_model_the_file_authored() {
        let document = extension_gltf(
            "sg.png",
            json!({"extensions":{"KHR_materials_pbrSpecularGlossiness":{"diffuseFactor":[0.5,0.25,0.125,1],"glossinessFactor":0.8,"specularFactor":[0.2,0.2,0.2]}}}),
            &[GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone()],
        );
        assert_eq!(
            gltf_material_kind(&document),
            SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND
        );
        with_gltf_material::<SpecularGlossinessPbrMaterial>(&document, |material| {
            assert_eq!(material.diffuse, packed_gltf_color(0.5, 0.25, 0.125));
            assert_eq!(material.specular, packed_gltf_color(0.2, 0.2, 0.2));
            assert_gltf_close(material.glossiness, 0.8);
        });
    }

    #[test]
    fn carries_the_channels_both_models_share_across_the_swap() {
        let document = extension_gltf(
            "sg.png",
            json!({"alphaMode":"MASK","alphaCutoff":0.25,"doubleSided":true,"emissiveFactor":[1,0,0],"extensions":{"KHR_materials_pbrSpecularGlossiness":{}},"name":"Legacy","normalTexture":{"index":0,"scale":0.5},"occlusionTexture":{"index":0,"strength":0.75}}),
            &[GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone()],
        );
        with_gltf_material::<SpecularGlossinessPbrMaterial>(&document, |material| {
            assert_eq!(material.material_fields().name.as_deref(), Some("Legacy"));
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Mask
            );
            assert_gltf_close(material.material3d_fields().alpha_cutoff, 0.25);
            assert!(material.material3d_fields().double_sided);
            assert!(material.normal_map.is_some());
            assert_gltf_close(material.normal_scale, 0.5);
            assert!(material.occlusion_map.is_some());
            assert_gltf_close(material.occlusion_strength, 0.75);
            assert_ne!(material.emissive, 0);
        });
    }

    #[test]
    fn samples_the_diffuse_and_packed_specular_glossiness_textures_as_srgb() {
        let document = extension_gltf(
            "sg.png",
            json!({"extensions":{"KHR_materials_pbrSpecularGlossiness":{"diffuseTexture":{"index":0},"specularGlossinessTexture":{"index":0}}}}),
            &[GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone()],
        );
        with_gltf_material::<SpecularGlossinessPbrMaterial>(&document, |material| {
            assert_eq!(
                material
                    .diffuse_map
                    .as_ref()
                    .unwrap()
                    .read()
                    .unwrap()
                    .texture_fields()
                    .color_space,
                TextureColorSpace::Srgb
            );
            assert_eq!(
                material
                    .specular_glossiness_map
                    .as_ref()
                    .unwrap()
                    .read()
                    .unwrap()
                    .texture_fields()
                    .color_space,
                TextureColorSpace::Srgb
            );
        });
    }

    #[test]
    fn takes_the_spec_defaults_for_an_empty_block() {
        let document = extension_gltf(
            "sg.png",
            json!({"extensions":{"KHR_materials_pbrSpecularGlossiness":{}}}),
            &[GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone()],
        );
        with_gltf_material::<SpecularGlossinessPbrMaterial>(&document, |material| {
            assert_eq!(material.diffuse, packed_gltf_color(1.0, 1.0, 1.0));
            assert_eq!(material.glossiness, 1.0);
        });
    }

    #[test]
    fn declines_a_material_another_handler_already_claimed_rather_than_clobbering_it() {
        let document = extension_gltf(
            "sg.png",
            json!({"extensions":{"KHR_materials_clearcoat":{"clearcoatFactor":1},"KHR_materials_pbrSpecularGlossiness":{"glossinessFactor":0.5}}}),
            &[
                GLTF_CLEARCOAT_EXTENSION_HANDLER.clone(),
                GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone(),
            ],
        );
        assert_eq!(gltf_material_kind(&document), EXTENDED_PBR_MATERIAL_KIND);
    }

    #[test]
    fn leaves_a_material_with_no_spec_gloss_block_on_the_standard_lane() {
        let document = extension_gltf(
            "sg.png",
            json!({"pbrMetallicRoughness":{"roughness":1}}),
            &[GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone()],
        );
        assert_eq!(gltf_material_kind(&document), STANDARD_PBR_MATERIAL_KIND);
    }
}
