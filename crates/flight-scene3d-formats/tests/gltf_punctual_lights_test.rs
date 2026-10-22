use crate::gltf_extension_test_helper::parse_extension_source;
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_lighting::{
    DIRECTIONAL_LIGHT_KIND, DirectionalLight, POINT_LIGHT_KIND, PointLight, SPOT_LIGHT_KIND,
    SpotLight,
};
use flight_scene3d_formats::contract::*;
use serde_json::json;
use std::any::Any;
use std::sync::{Arc, RwLock};

mod gltf_punctual_lights_extension_handler {
    use super::*;

    #[test]
    fn individually_realizes_placed_directional_point_and_spot_lights() {
        let source = json!({"asset":{"version":"2.0"},"extensions":{"KHR_lights_punctual":{"lights":[{"color":[1,0,0],"intensity":2,"name":"sun","type":"directional"},{"intensity":3,"range":10,"type":"point"},{"spot":{"innerConeAngle":0.25,"outerConeAngle":0.5},"type":"spot"}]}},"extensionsRequired":["KHR_lights_punctual"],"nodes":[{"extensions":{"KHR_lights_punctual":{"light":0}},"translation":[1,2,3]},{"extensions":{"KHR_lights_punctual":{"light":1}}},{"extensions":{"KHR_lights_punctual":{"light":2}}}],"scenes":[{"nodes":[0,1,2]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_extension_source(
            source,
            Some(&diagnostics),
            &[GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER.clone()],
        );
        assert!(diagnostics.read().unwrap().is_empty());
        let document = document.read().unwrap();
        assert_eq!(document.lights.len(), 3);
        let directional = document.lights[0].descriptor.read().unwrap();
        let directional = (&*directional as &dyn Any)
            .downcast_ref::<DirectionalLight>()
            .unwrap();
        assert_eq!(directional.kind, DIRECTIONAL_LIGHT_KIND);
        assert_eq!(directional.intensity, 2.0);
        assert_eq!(directional.color, 0xff0000ff);
        assert_eq!(
            [
                directional.direction.x,
                directional.direction.y,
                directional.direction.z
            ],
            [0.0, 0.0, -1.0]
        );
        assert_eq!(document.lights[0].name.as_deref(), Some("sun"));
        assert_eq!(document.lights[0].node, Some(0));
        let position = &document.lights[0].transform.position;
        assert_eq!([position.x, position.y, position.z], [1.0, 2.0, 3.0]);
        let point = document.lights[1].descriptor.read().unwrap();
        let point = (&*point as &dyn Any).downcast_ref::<PointLight>().unwrap();
        assert_eq!(point.kind, POINT_LIGHT_KIND);
        assert_eq!(point.intensity, 3.0);
        assert_eq!(point.range, 10.0);
        let spot = document.lights[2].descriptor.read().unwrap();
        let spot = (&*spot as &dyn Any).downcast_ref::<SpotLight>().unwrap();
        assert_eq!(spot.kind, SPOT_LIGHT_KIND);
        // D1 f32 bound (TS: 0.005)
        assert!(
            (spot.inner_cone_cos as f64 - 0.25_f64.cos()).abs()
                <= 0.005_f64.max(4.0 * f32::EPSILON as f64)
        );
        // D1 f32 bound (TS: 0.005)
        assert!(
            (spot.outer_cone_cos as f64 - 0.5_f64.cos()).abs()
                <= 0.005_f64.max(4.0 * f32::EPSILON as f64)
        );
    }

    #[test]
    fn is_absent_unless_the_caller_imports_and_supplies_it() {
        let mut source = make_light_gltf(json!({"type":"point"}));
        source["extensionsRequired"] = json!(["KHR_lights_punctual"]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_extension_source(source, Some(&diagnostics), &[]);
        assert!(document.read().unwrap().lights.is_empty());
        let diagnostics = diagnostics.read().unwrap();
        let diagnostic = diagnostics
            .iter()
            .find(|entry| entry.kind == "gltf.unsupported-required-extension")
            .unwrap();
        assert_eq!(
            diagnostic,
            &ImportDiagnostic {
                kind: "gltf.unsupported-required-extension".to_string(),
                origin: "buildGltfDocument".to_string(),
                severity: ImportDiagnosticSeverity::Skip,
                detail: Some(std::collections::HashMap::from([
                    (
                        "count".to_string(),
                        ImportDiagnosticDetailValue::Number(1.0)
                    ),
                    (
                        "firstExtension".to_string(),
                        ImportDiagnosticDetailValue::String("KHR_lights_punctual".to_string())
                    )
                ])),
            }
        );
    }

    #[test]
    fn loads_an_unhandled_optional_extension_without_claiming_that_it_was_skipped() {
        let mut source = make_light_gltf(json!({"type":"point"}));
        source["extensionsUsed"] = json!(["KHR_lights_punctual"]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_extension_source(source, Some(&diagnostics), &[]);
        let document = document.read().unwrap();
        assert_eq!(document.nodes.len(), 1);
        assert_eq!(document.scenes.len(), 1);
        assert!(document.lights.is_empty());
        assert!(diagnostics.read().unwrap().is_empty());
    }

    #[test]
    fn drops_and_reports_light_missing_for_a_node_referencing_a_missing_light() {
        let source = json!({"asset":{"version":"2.0"},"extensions":{"KHR_lights_punctual":{"lights":[]}},"nodes":[{"extensions":{"KHR_lights_punctual":{"light":5}}}],"scenes":[{"nodes":[0]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_extension_source(
            source,
            Some(&diagnostics),
            &[GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER.clone()],
        );
        assert!(document.read().unwrap().lights.is_empty());
        let diagnostic = find_light_diagnostic(&diagnostics, "gltf.light-missing");
        assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(diagnostic.origin, "buildGltfPunctualLight");
        let detail = diagnostic.detail.unwrap();
        assert_eq!(
            detail.get("count"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
        assert_eq!(
            detail.get("firstLight"),
            Some(&ImportDiagnosticDetailValue::Number(5.0))
        );
        assert_eq!(
            detail.get("firstNode"),
            Some(&ImportDiagnosticDetailValue::Number(0.0))
        );
    }

    #[test]
    fn drops_the_light_and_reports_light_negative_intensity() {
        assert_dropped_light(
            json!({"intensity":-1,"type":"point"}),
            "gltf.light-negative-intensity",
            ImportDiagnosticSeverity::Drop,
        );
    }

    #[test]
    fn drops_the_light_and_reports_light_non_positive_range() {
        assert_dropped_light(
            json!({"range":0,"type":"point"}),
            "gltf.light-non-positive-range",
            ImportDiagnosticSeverity::Drop,
        );
    }

    #[test]
    fn drops_the_light_and_reports_light_invalid_spot_cone() {
        assert_dropped_light(
            json!({"spot":{"innerConeAngle":0.6,"outerConeAngle":0.3},"type":"spot"}),
            "gltf.light-invalid-spot-cone",
            ImportDiagnosticSeverity::Drop,
        );
    }

    #[test]
    fn skips_and_reports_light_unsupported_type() {
        let diagnostic = assert_dropped_light(
            json!({"type":"area"}),
            "gltf.light-unsupported-type",
            ImportDiagnosticSeverity::Skip,
        );
        assert_eq!(
            diagnostic.detail.unwrap().get("firstType"),
            Some(&ImportDiagnosticDetailValue::String("area".to_string()))
        );
    }

    #[test]
    fn aggregates_repeated_light_missing_drops_across_nodes_into_one_crumb_with_a_count() {
        let source = json!({"asset":{"version":"2.0"},"extensions":{"KHR_lights_punctual":{"lights":[]}},"nodes":[{"extensions":{"KHR_lights_punctual":{"light":3}}},{"extensions":{"KHR_lights_punctual":{"light":4}}}],"scenes":[{"nodes":[0,1]}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        parse_extension_source(
            source,
            Some(&diagnostics),
            &[GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER.clone()],
        );
        let diagnostics = diagnostics.read().unwrap();
        let matching: Vec<_> = diagnostics
            .iter()
            .filter(|entry| entry.kind == "gltf.light-missing")
            .collect();
        assert_eq!(matching.len(), 1);
        let detail = matching[0].detail.as_ref().unwrap();
        assert_eq!(
            detail.get("count"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
        assert_eq!(
            detail.get("firstLight"),
            Some(&ImportDiagnosticDetailValue::Number(3.0))
        );
    }

    #[test]
    fn emits_no_diagnostics_when_no_collector_array_is_supplied() {
        parse_extension_source(
            make_light_gltf(json!({"intensity":-1,"type":"area"})),
            None,
            &[GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER.clone()],
        );
    }
}

fn assert_dropped_light(
    light: serde_json::Value,
    kind: &str,
    severity: ImportDiagnosticSeverity,
) -> ImportDiagnostic {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_extension_source(
        make_light_gltf(light),
        Some(&diagnostics),
        &[GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER.clone()],
    );
    assert!(document.read().unwrap().lights.is_empty());
    let diagnostic = find_light_diagnostic(&diagnostics, kind);
    assert_eq!(diagnostic.severity, severity);
    assert_eq!(diagnostic.origin, "buildGltfPunctualLight");
    assert_eq!(
        diagnostic.detail.as_ref().unwrap().get("firstLight"),
        Some(&ImportDiagnosticDetailValue::Number(0.0))
    );
    assert_eq!(
        diagnostic.detail.as_ref().unwrap().get("count"),
        Some(&ImportDiagnosticDetailValue::Number(1.0))
    );
    return diagnostic;
}

fn find_light_diagnostic(diagnostics: &Ref<Vec<ImportDiagnostic>>, kind: &str) -> ImportDiagnostic {
    return diagnostics
        .read()
        .unwrap()
        .iter()
        .find(|entry| entry.kind == kind)
        .unwrap()
        .clone();
}

fn make_light_gltf(light: serde_json::Value) -> serde_json::Value {
    return json!({"asset":{"version":"2.0"},"extensions":{"KHR_lights_punctual":{"lights":[light]}},"nodes":[{"extensions":{"KHR_lights_punctual":{"light":0}}}],"scenes":[{"nodes":[0]}]});
}
