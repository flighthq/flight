use crate::gltf_extension_test_helper::*;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_materials::{ExtendedPbrMaterial, StandardPbrMaterial};
use flight_scene3d_formats::contract::*;
use serde_json::json;
use std::sync::{Arc, RwLock};

mod gltf_emissive_strength_extension_handler {
    use super::*;

    #[test]
    fn applies_the_strength_the_file_states() {
        let document = parse_extension_source(
            json!({"asset":{"version":"2.0"},"materials":[{"emissiveFactor":[1,1,1],"extensions":{"KHR_materials_emissive_strength":{"emissiveStrength":4}}}],"scenes":[{"nodes":[]}]}),
            None,
            &[GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER.clone()],
        );
        with_gltf_material::<StandardPbrMaterial>(&document, |material| {
            assert_gltf_close(material.emissive_strength, 4.0)
        });
    }

    #[test]
    fn leaves_every_material_at_strength_one_when_the_handler_is_not_imported() {
        let document = parse_extension_source(
            json!({"asset":{"version":"2.0"},"materials":[{"emissiveFactor":[1,1,1],"extensions":{"KHR_materials_emissive_strength":{"emissiveStrength":4}}}],"scenes":[{"nodes":[]}]}),
            None,
            &[],
        );
        with_gltf_material::<StandardPbrMaterial>(&document, |material| {
            assert_eq!(material.emissive_strength, 1.0)
        });
    }

    #[test]
    fn follows_a_material_another_handler_already_promoted() {
        let document = parse_extension_source(
            json!({"asset":{"version":"2.0"},"materials":[{"extensions":{"KHR_materials_clearcoat":{"clearcoatFactor":1},"KHR_materials_emissive_strength":{"emissiveStrength":3}}}],"scenes":[{"nodes":[]}]}),
            None,
            &[
                GLTF_CLEARCOAT_EXTENSION_HANDLER.clone(),
                GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER.clone(),
            ],
        );
        with_gltf_material::<ExtendedPbrMaterial>(&document, |material| {
            assert_gltf_close(material.standard.emissive_strength, 3.0)
        });
    }

    #[test]
    fn drops_a_negative_strength_and_reports_it() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_extension_source(
            json!({"asset":{"version":"2.0"},"materials":[{"extensions":{"KHR_materials_emissive_strength":{"emissiveStrength":-2}}}],"scenes":[{"nodes":[]}]}),
            Some(&diagnostics),
            &[GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER.clone()],
        );
        with_gltf_material::<StandardPbrMaterial>(&document, |material| {
            assert_eq!(material.emissive_strength, 1.0)
        });
        let diagnostics = diagnostics.read().unwrap();
        let diagnostic = diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "gltf.emissive-strength-negative")
            .unwrap();
        assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Drop);
    }

    #[test]
    fn satisfies_a_required_extension_declaration_so_the_asset_is_not_reported_unsupported() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        parse_extension_source(
            json!({"asset":{"version":"2.0"},"materials":[{"extensions":{"KHR_materials_emissive_strength":{"emissiveStrength":2}}}],"scenes":[{"nodes":[]}],"extensionsRequired":["KHR_materials_emissive_strength"]}),
            Some(&diagnostics),
            &[GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER.clone()],
        );
        assert!(
            !diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|diagnostic| diagnostic.kind == "gltf.unsupported-required-extension")
        );
    }
}
