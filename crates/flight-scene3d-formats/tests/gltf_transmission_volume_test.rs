use crate::gltf_extension_test_helper::*;
use flight_materials::{ExtendedPbrMaterial, PbrExtension, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND};
use flight_scene3d_formats::contract::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use serde_json::json;

mod gltf_ior_extension_handler {
    use super::*;

    #[test]
    fn imports_the_stated_index_of_refraction() {
        let document = extension_gltf(
            "glass.png",
            json!({"extensions":{"KHR_materials_ior":{"ior":1.33}}}),
            &[GLTF_IOR_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::TransmissionVolume(extension) = &*extension else {
            panic!("expected transmission volume");
        };
        assert_eq!(extension.kind, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND);
        assert_gltf_close(extension.ior, 1.33);
    }

    #[test]
    fn takes_the_spec_default_of_1_5_for_an_empty_block() {
        let document = extension_gltf(
            "glass.png",
            json!({"extensions":{"KHR_materials_ior":{}}}),
            &[GLTF_IOR_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::TransmissionVolume(extension) = &*extension else {
            panic!("expected transmission volume");
        };
        assert_gltf_close(extension.ior, 1.5);
    }

    #[test]
    fn fills_one_shared_descriptor_when_all_three_handlers_run_in_either_order() {
        let source = json!({"extensions":{"KHR_materials_ior":{"ior":1.4},"KHR_materials_transmission":{"transmissionFactor":0.7},"KHR_materials_volume":{"thicknessFactor":5}}});
        let forward = extension_gltf(
            "glass.png",
            source.clone(),
            &[
                GLTF_TRANSMISSION_EXTENSION_HANDLER.clone(),
                GLTF_VOLUME_EXTENSION_HANDLER.clone(),
                GLTF_IOR_EXTENSION_HANDLER.clone(),
            ],
        );
        let reversed = extension_gltf(
            "glass.png",
            source,
            &[
                GLTF_IOR_EXTENSION_HANDLER.clone(),
                GLTF_VOLUME_EXTENSION_HANDLER.clone(),
                GLTF_TRANSMISSION_EXTENSION_HANDLER.clone(),
            ],
        );
        for document in [forward, reversed] {
            with_gltf_material::<ExtendedPbrMaterial>(&document, |material| {
                assert_eq!(material.extensions.len(), 1)
            });
            let extension = first_gltf_extension(&document);
            let extension = extension.read().unwrap();
            let PbrExtension::TransmissionVolume(extension) = &*extension else {
                panic!("expected transmission volume");
            };
            assert_gltf_close(extension.transmission, 0.7);
            assert_gltf_close(extension.thickness, 5.0);
            assert_gltf_close(extension.ior, 1.4);
        }
    }
}

mod gltf_transmission_extension_handler {
    use super::*;

    #[test]
    fn imports_the_transmission_factor_and_its_linear_map() {
        let document = extension_gltf(
            "glass.png",
            json!({"extensions":{"KHR_materials_transmission":{"transmissionFactor":0.9,"transmissionTexture":{"index":0}}}}),
            &[GLTF_TRANSMISSION_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::TransmissionVolume(extension) = &*extension else {
            panic!("expected transmission volume");
        };
        assert_gltf_close(extension.transmission, 0.9);
        assert_eq!(
            extension
                .transmission_map
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
    fn works_alone_without_the_volume_or_ior_siblings() {
        let document = extension_gltf(
            "glass.png",
            json!({"extensions":{"KHR_materials_transmission":{"transmissionFactor":1}}}),
            &[GLTF_TRANSMISSION_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::TransmissionVolume(extension) = &*extension else {
            panic!("expected transmission volume");
        };
        assert_eq!(extension.transmission, 1.0);
    }
}

mod gltf_volume_extension_handler {
    use super::*;

    #[test]
    fn imports_thickness_and_srgb_encodes_the_linear_attenuation_color() {
        let document = extension_gltf(
            "glass.png",
            json!({"extensions":{"KHR_materials_volume":{"attenuationColor":[0.5,0.25,0.125],"attenuationDistance":3,"thicknessFactor":2,"thicknessTexture":{"index":0}}}}),
            &[GLTF_VOLUME_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::TransmissionVolume(extension) = &*extension else {
            panic!("expected transmission volume");
        };
        assert_gltf_close(extension.thickness, 2.0);
        assert_gltf_close(extension.attenuation_distance, 3.0);
        assert_eq!(
            extension.attenuation_color,
            packed_gltf_color(0.5, 0.25, 0.125)
        );
        assert_eq!(
            extension
                .thickness_map
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
    fn defaults_attenuation_distance_to_infinity_a_volume_that_never_absorbs() {
        let document = extension_gltf(
            "glass.png",
            json!({"extensions":{"KHR_materials_volume":{}}}),
            &[GLTF_VOLUME_EXTENSION_HANDLER.clone()],
        );
        let extension = first_gltf_extension(&document);
        let extension = extension.read().unwrap();
        let PbrExtension::TransmissionVolume(extension) = &*extension else {
            panic!("expected transmission volume");
        };
        assert_eq!(extension.attenuation_distance, f32::INFINITY);
    }
}
