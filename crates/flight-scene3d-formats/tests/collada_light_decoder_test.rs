use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_lighting::{AmbientLight, DirectionalLight, PointLight, SpotLight};
use flight_scene3d_formats::*;
use std::any::Any;
use std::sync::Arc;

const SOURCE_XML_0: &str = r##"<COLLADA><library_lights><light id="ambient" name="Fill"><technique_common><ambient><color>0.25 0.5 0.75</color></ambient></technique_common></light><light id="directional" name="Sun"><technique_common><directional><color>2 1 0.5</color></directional></technique_common></light><light id="point" name="Bulb"><technique_common><point><color>1 1 1</color><constant_attenuation>0</constant_attenuation><quadratic_attenuation>0.25</quadratic_attenuation></point></technique_common></light><light id="spot" name="Stage"><technique_common><spot><color>1 1 1</color><constant_attenuation>0</constant_attenuation><linear_attenuation>0.5</linear_attenuation><falloff_angle>60</falloff_angle><falloff_exponent>3</falloff_exponent></spot></technique_common></light></library_lights><library_visual_scenes><visual_scene id="vs"><node><instance_light url="#ambient"/></node><node><instance_light url="#directional"/></node><node><instance_light url="#point"/></node><node><instance_light url="#spot"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_1: &str = r##"<COLLADA><asset><up_axis>Z_UP</up_axis></asset><library_lights><light id="lamp"><technique_common><point><color>1 1 1</color></point></technique_common></light></library_lights><library_visual_scenes><visual_scene id="vs"><node id="parent"><translate>0 2 3</translate><instance_light url="#lamp"/><node id="child"><translate>4 5 6</translate><instance_light url="#lamp"/></node></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_2: &str = r##"<COLLADA><library_lights><light id="mixed"><technique_common><point><color>1 1 1</color><constant_attenuation>1</constant_attenuation><linear_attenuation>2</linear_attenuation><quadratic_attenuation>1</quadratic_attenuation></point></technique_common></light></library_lights><library_visual_scenes><visual_scene id="vs"><node><instance_light url="#mixed"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_3: &str = r##"<COLLADA><library_lights><light><technique_common><ambient><color>1 1 1</color></ambient></technique_common></light><light id="bad-color"><technique_common><ambient><color>red 1 1</color></ambient></technique_common></light><light id="bad-attenuation"><technique_common><point><color>1 1 1</color><quadratic_attenuation>-1</quadratic_attenuation></point></technique_common></light><light id="bad-falloff"><technique_common><spot><color>1 1 1</color><falloff_exponent>NaN</falloff_exponent></spot></technique_common></light><light id="bad-type"><technique_common><ambient><color>1 1 1</color></ambient><point><color>1 1 1</color></point></technique_common></light></library_lights><library_visual_scenes><visual_scene id="vs"><node><instance_light/><instance_light url="#bad-color"/><instance_light url="#missing"/><instance_light url="other.dae#lamp"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

fn parse_lights(xml: &str) -> ColladaParseResult {
    return parse_collada(xml, None);
}

mod collada_light_decoder {
    use super::*;

    #[test]
    fn imports_ambient_directional_point_and_spot_technique_common_lights() {
        let decoder = COLLADA_LIGHT_DECODER.read().unwrap();
        assert_eq!(decoder.build_phase, Some(20.0));
        assert!(decoder.build.is_some());
        assert_eq!(decoder.elements, ["light"]);
        assert_eq!(
            decoder.features,
            [
                "Light",
                "Light.Ambient",
                "Light.Directional",
                "Light.Point",
                "Light.Spot"
            ]
        );
        drop(decoder);
        let result = parse_lights(SOURCE_XML_0);
        assert!(result.diagnostics.read().unwrap().is_empty());
        let document = result.document.read().unwrap();
        assert_eq!(document.lights.len(), 4);
        let lights = &document.lights;
        for (i, name) in ["Fill", "Sun", "Bulb", "Stage"].into_iter().enumerate() {
            assert_eq!(
                (lights[i].name.as_deref(), lights[i].node),
                (Some(name), Some(i as i32))
            );
        }
        let ambient_guard = lights[0].descriptor.read().unwrap();
        let ambient = (&*ambient_guard as &dyn Any)
            .downcast_ref::<AmbientLight>()
            .unwrap();
        assert_eq!(ambient.kind, flight_lighting::AMBIENT_LIGHT_KIND);
        assert_eq!(ambient.color, 0x89bce1ff);
        assert_eq!(ambient.intensity, 1.0);
        let direct_guard = lights[1].descriptor.read().unwrap();
        let direct = (&*direct_guard as &dyn Any)
            .downcast_ref::<DirectionalLight>()
            .unwrap();
        assert_eq!(direct.kind, flight_lighting::DIRECTIONAL_LIGHT_KIND);
        assert_eq!(direct.color, 0xffbc89ff);
        assert_eq!(direct.intensity, 2.0);
        assert_eq!(
            (direct.direction.x, direct.direction.y, direct.direction.z),
            (0.0, 0.0, -1.0)
        );
        let point_guard = lights[2].descriptor.read().unwrap();
        let point = (&*point_guard as &dyn Any)
            .downcast_ref::<PointLight>()
            .unwrap();
        assert_eq!(point.kind, flight_lighting::POINT_LIGHT_KIND);
        assert_eq!(
            (point.decay, point.intensity, point.range),
            (2.0, 4.0, -1.0)
        );
        assert_eq!(
            (point.position.x, point.position.y, point.position.z),
            (0.0, 0.0, 0.0)
        );
        let spot_guard = lights[3].descriptor.read().unwrap();
        let spot = (&*spot_guard as &dyn Any)
            .downcast_ref::<SpotLight>()
            .unwrap();
        assert_eq!(spot.kind, flight_lighting::SPOT_LIGHT_KIND);
        assert_eq!(
            (
                spot.decay,
                spot.intensity,
                spot.range,
                spot.spot_blend,
                spot.inner_cone_cos
            ),
            (1.0, 2.0, -1.0, 0.75, 1.0)
        );
        assert_eq!(
            (spot.direction.x, spot.direction.y, spot.direction.z),
            (0.0, 0.0, -1.0)
        );
        // D1 f32 bound (TS: 0.005)
        assert!(((spot.outer_cone_cos as f64) - (std::f64::consts::PI / 6.0).cos()).abs() < 0.005);
    }

    #[test]
    fn binds_each_instance_light_to_its_hierarchy_node_after_root_axis_conversion() {
        let result = parse_lights(SOURCE_XML_1);
        let document = result.document.read().unwrap();
        assert_eq!(document.nodes[0].children, [1]);
        let lights = &document.lights;
        assert_eq!(
            lights.iter().map(|light| light.node).collect::<Vec<_>>(),
            [Some(0), Some(1)]
        );
        assert_eq!(
            (
                lights[0].transform.position.x,
                lights[0].transform.position.y,
                lights[0].transform.position.z
            ),
            (0.0, 3.0, -2.0)
        );
        assert_eq!(
            (
                lights[1].transform.position.x,
                lights[1].transform.position.y
            ),
            (4.0, 9.0)
        );
        // D1 f32 bound (TS: 0)
        assert!(
            (lights[1].transform.position.z - -7.0).abs()
                <= 4.0 * f32::EPSILON * (-7.0_f32).abs().max(1.0)
        );
        assert!(!Arc::ptr_eq(&lights[0].descriptor, &lights[1].descriptor));
        assert!(!std::ptr::eq(
            &lights[0].transform,
            &document.nodes[0].transform
        ));
        let point_guard = lights[0].descriptor.read().unwrap();
        let point = (&*point_guard as &dyn Any)
            .downcast_ref::<PointLight>()
            .unwrap();
        assert_eq!(point.decay, 0.0);
    }

    #[test]
    fn approximates_mixed_collada_attenuation_at_unit_distance() {
        let result = parse_lights(SOURCE_XML_2);
        let document = result.document.read().unwrap();
        let guard = document.lights[0].descriptor.read().unwrap();
        let point = (&*guard as &dyn Any).downcast_ref::<PointLight>().unwrap();
        assert_eq!((point.decay, point.intensity), (1.0, 0.25));
        let diagnostics = result.diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        let entry = &diagnostics[0];
        assert_eq!(entry.kind, "collada.light-attenuation-approximated");
        assert_eq!(entry.severity, ImportDiagnosticSeverity::Recover);
        let detail = entry.detail.as_ref().unwrap();
        assert_eq!(detail.len(), 4);
        for (key, value) in [("constant", 1.0), ("linear", 2.0), ("quadratic", 1.0)] {
            assert_eq!(
                detail.get(key),
                Some(&ImportDiagnosticDetailValue::Number(value))
            );
        }
        assert_eq!(
            detail.get("light"),
            Some(&ImportDiagnosticDetailValue::String("mixed".to_string()))
        );
    }

    #[test]
    fn diagnoses_malformed_light_definitions_and_missing_instance_light_references() {
        let result = parse_lights(SOURCE_XML_3);
        assert!(result.document.read().unwrap().lights.is_empty());
        let diagnostics = result.diagnostics.read().unwrap();
        let malformed = diagnostics
            .iter()
            .filter(|entry| entry.kind == "collada.light-malformed")
            .collect::<Vec<_>>();
        let expected = [
            ("id", "(missing)"),
            ("color", "bad-color"),
            ("quadratic_attenuation", "bad-attenuation"),
            ("falloff_exponent", "bad-falloff"),
            ("type", "bad-type"),
        ];
        assert_eq!(malformed.len(), expected.len());
        for (entry, (field, light)) in malformed.iter().zip(expected) {
            let detail = entry.detail.as_ref().unwrap();
            assert_eq!(detail.len(), 2);
            assert_eq!(
                detail.get("field"),
                Some(&ImportDiagnosticDetailValue::String(field.to_string()))
            );
            assert_eq!(
                detail.get("light"),
                Some(&ImportDiagnosticDetailValue::String(light.to_string()))
            );
        }
        assert_eq!(
            diagnostics
                .iter()
                .filter(|entry| entry.kind == "collada.missing-reference")
                .count(),
            3
        );
    }
}
