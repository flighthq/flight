use super::awd2_test_helper::{awd_string, block, file, property_list, scene_header};
use flight_entity::Ref;
use flight_geometry::{create_vector3, rotate_vector3_by_quaternion};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_lighting::{AmbientLight, DirectionalLight, PointLight};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentLight};
use flight_scene3d_formats::*;
use std::any::Any;
use std::sync::{Arc, RwLock};

const IDENTITY: [f64; 12] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

fn aim_of(light: &Scene3DDocumentLight) -> [f64; 3] {
    let source = create_vector3(0.0, 0.0, -1.0);
    let mut aim = create_vector3(0.0, 0.0, 0.0);
    rotate_vector3_by_quaternion(&mut aim, &source, &light.transform.rotation);
    return [aim.x, aim.y, aim.z].map(|value| (f64::from(value) * 1e6 + 0.5).floor() / 1e6 + 0.0);
}

fn light_body(
    name: &str,
    parent: u32,
    kind: u8,
    transform: &[f64; 12],
    wide: bool,
    properties: &[(u16, Vec<u8>)],
) -> Vec<u8> {
    let mut bytes = scene_header(name, parent, transform, wide);
    bytes.push(kind);
    bytes.extend_from_slice(&property_list(properties));
    bytes.extend_from_slice(&[0; 4]);
    return bytes;
}

fn parse_lights(blocks: &[Vec<u8>]) -> (Ref<Scene3DDocument>, Vec<ImportDiagnostic>) {
    let source = Arc::new(RwLock::new(file(blocks).into_boxed_slice()));
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_awd2(
        &source,
        &Awd2ParseOptions {
            blocks: vec![
                AWD2_CONTAINER_HANDLER.clone(),
                AWD2_MESH_INSTANCE_HANDLER.clone(),
                AWD2_LIGHT_HANDLER.clone(),
                AWD2_LIGHT_PICKER_HANDLER.clone(),
            ],
            deflate: None,
            lzma: None,
        },
        Some(&diagnostics),
    );
    let diagnostics = diagnostics.read().unwrap().clone();
    return (document, diagnostics);
}

fn picker_body(name: &str, lights: &[u32]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&(lights.len() as u16).to_le_bytes());
    for id in lights {
        bytes.extend_from_slice(&id.to_le_bytes());
    }
    return bytes;
}

mod awd2_light_handler {
    use super::*;

    #[test]
    fn claims_lights_with_real_parse_and_lighting_build_callbacks() {
        let handler = AWD2_LIGHT_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_LIGHT]);
        assert_eq!(handler.build_phase, Some(AWD2_BUILD_PHASE_LIGHTING as f32));
        assert!(handler.build.is_some());
        assert_ne!(handler.deferred, Some(true));
    }

    #[test]
    fn splits_directional_and_ambient_terms_and_preserves_the_authored_color_intensity_and_local_axis()
     {
        let properties = [
            (AWD2_LIGHT_PROP_COLOR, 0xff8040_u32.to_le_bytes().to_vec()),
            (AWD2_LIGHT_PROP_DIFFUSE, 0.7_f32.to_le_bytes().to_vec()),
            (
                AWD2_LIGHT_PROP_AMBIENT_COLOR,
                0x203040_u32.to_le_bytes().to_vec(),
            ),
            (AWD2_LIGHT_PROP_AMBIENT, 0.3_f32.to_le_bytes().to_vec()),
            (
                AWD2_LIGHT_PROP_DIRECTION_Y,
                (-1.0_f32).to_le_bytes().to_vec(),
            ),
            (AWD2_LIGHT_PROP_DIRECTION_Z, 0.0_f32.to_le_bytes().to_vec()),
        ];
        let (document, diagnostics) = parse_lights(&[block(
            AWD2_BLOCK_LIGHT,
            0,
            1,
            &light_body(
                "Sun",
                0,
                AWD2_LIGHT_TYPE_DIRECTIONAL,
                &IDENTITY,
                false,
                &properties,
            ),
        )]);
        assert!(diagnostics.is_empty());
        let document = document.read().unwrap();
        assert_eq!(document.lights.len(), 2);
        let direct = &document.lights[0];
        assert_eq!(direct.name.as_deref(), Some("Sun"));
        assert_eq!(direct.node, None);
        let descriptor = direct.descriptor.read().unwrap();
        let sun = (&*descriptor as &dyn Any)
            .downcast_ref::<DirectionalLight>()
            .unwrap();
        assert_eq!(sun.kind, flight_lighting::DIRECTIONAL_LIGHT_KIND);
        assert_eq!(sun.color, 0xff8040ff);
        assert!((sun.intensity - 0.7).abs() < 0.5e-6);
        assert!(!sun.casts_shadow);
        assert_eq!(
            [sun.direction.x, sun.direction.y, sun.direction.z],
            [0.0, 0.0, -1.0]
        );
        assert_eq!(aim_of(direct), [0.0, -1.0, 0.0]);
        let ambient = &document.lights[1];
        assert_eq!(ambient.name.as_deref(), Some("Sun Ambient"));
        let descriptor = ambient.descriptor.read().unwrap();
        let fill = (&*descriptor as &dyn Any)
            .downcast_ref::<AmbientLight>()
            .unwrap();
        assert_eq!(fill.kind, flight_lighting::AMBIENT_LIGHT_KIND);
        assert_eq!(fill.color, 0x203040ff);
        assert!((fill.intensity - 0.3).abs() < 0.5e-6);
        assert_eq!(ambient.node, None);
        assert_eq!(ambient.transform.rotation.w, 1.0);
    }

    #[test]
    fn normalizes_property_aims_after_handedness_conversion_and_ignores_directional_placement_matrices()
     {
        let rotated = [0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 5.0, 6.0, 7.0];
        for (y, z, expected) in [
            (-3.0_f32, 4.0_f32, [0.0, -0.6, -0.8]),
            (-1.0, 0.0, [0.0, -1.0, 0.0]),
        ] {
            let (document, diagnostics) = parse_lights(&[block(
                AWD2_BLOCK_LIGHT,
                0,
                1,
                &light_body(
                    "Sun",
                    0,
                    AWD2_LIGHT_TYPE_DIRECTIONAL,
                    &rotated,
                    false,
                    &[
                        (AWD2_LIGHT_PROP_DIRECTION_Y, y.to_le_bytes().to_vec()),
                        (AWD2_LIGHT_PROP_DIRECTION_Z, z.to_le_bytes().to_vec()),
                    ],
                ),
            )]);
            assert!(diagnostics.is_empty());
            let document = document.read().unwrap();
            let light = &document.lights[0];
            assert_eq!(aim_of(light), expected);
            assert_eq!(
                [
                    light.transform.position.x,
                    light.transform.position.y,
                    light.transform.position.z
                ],
                [0.0; 3]
            );
            assert_eq!(light.transform.scale.x, 1.0);
        }
        let (document, diagnostics) = parse_lights(&[block(
            AWD2_BLOCK_LIGHT,
            0,
            1,
            &light_body("", 99, AWD2_LIGHT_TYPE_DIRECTIONAL, &IDENTITY, false, &[]),
        )]);
        assert!(diagnostics.is_empty());
        let document = document.read().unwrap();
        assert_eq!(document.lights.len(), 1);
        assert!(document.lights[0].name.is_none());
        assert!(document.lights[0].node.is_none());
        let aim = aim_of(&document.lights[0]);
        assert_eq!(aim[0], 0.0);
        assert!((aim[1] + std::f64::consts::FRAC_1_SQRT_2).abs() < 0.5e-6);
        assert!((aim[2] + std::f64::consts::FRAC_1_SQRT_2).abs() < 0.5e-6);
        let descriptor = document.lights[0].descriptor.read().unwrap();
        let sun = (&*descriptor as &dyn Any)
            .downcast_ref::<DirectionalLight>()
            .unwrap();
        assert_eq!(sun.kind, flight_lighting::DIRECTIONAL_LIGHT_KIND);
        assert_eq!(sun.color, 0xffffffff);
        assert_eq!(sun.intensity, 1.0);
        assert!(!sun.casts_shadow);
    }

    #[test]
    fn places_point_lights_with_both_matrix_widths_binds_the_parent_and_reads_wide_property_numbers()
     {
        for wide in [false, true] {
            let mut transform = IDENTITY;
            transform[9..].copy_from_slice(&[3.0, 4.0, 5.0]);
            let properties = [
                (AWD2_LIGHT_PROP_COLOR, 0x00ff00_u32.to_le_bytes().to_vec()),
                (AWD2_LIGHT_PROP_DIFFUSE, 2.0_f64.to_le_bytes().to_vec()),
                (AWD2_LIGHT_PROP_FALLOFF, 40.0_f32.to_le_bytes().to_vec()),
                (AWD2_LIGHT_PROP_SHADOW_MAPPER, vec![1]),
                (AWD2_LIGHT_PROP_AMBIENT, 0.375_f64.to_le_bytes().to_vec()),
            ];
            let mut record = block(
                AWD2_BLOCK_LIGHT,
                0,
                5,
                &light_body(
                    "Lamp",
                    4,
                    AWD2_LIGHT_TYPE_POINT,
                    &transform,
                    wide,
                    &properties,
                ),
            );
            record[6] = u8::from(wide);
            let (document, diagnostics) = parse_lights(&[
                record,
                block(
                    AWD2_BLOCK_CONTAINER,
                    0,
                    4,
                    &scene_header("Rig", 0, &IDENTITY, false),
                ),
            ]);
            assert!(diagnostics.is_empty());
            let document = document.read().unwrap();
            assert_eq!(document.lights.len(), 2);
            assert_eq!(document.nodes[0].name.as_deref(), Some("Rig"));
            let light = &document.lights[0];
            assert_eq!(light.node, Some(0));
            assert_eq!(
                [
                    light.transform.position.x,
                    light.transform.position.y,
                    light.transform.position.z
                ],
                [3.0, 4.0, -5.0]
            );
            let descriptor = light.descriptor.read().unwrap();
            let lamp = (&*descriptor as &dyn Any)
                .downcast_ref::<PointLight>()
                .unwrap();
            assert_eq!(lamp.kind, flight_lighting::POINT_LIGHT_KIND);
            assert_eq!(lamp.color, 0x00ff00ff);
            assert_eq!(lamp.intensity, 2.0);
            assert_eq!(lamp.range, 40.0);
            assert!(lamp.casts_shadow);
            assert_eq!(
                [lamp.position.x, lamp.position.y, lamp.position.z],
                [0.0; 3]
            );
            assert_eq!(document.lights[1].node, Some(0));
            let ambient = document.lights[1].descriptor.read().unwrap();
            assert_eq!(
                (&*ambient as &dyn Any)
                    .downcast_ref::<AmbientLight>()
                    .unwrap()
                    .intensity,
                0.375
            );
        }
    }

    #[test]
    fn aggregates_source_drop_kinds_in_order_with_first_offender_details_and_omits_unsupported_compounds()
     {
        let mut blocks = Vec::new();
        for (id, name, specular) in [(1, "First", 0.5_f32), (2, "Second", 0.25_f32)] {
            blocks.push(block(
                AWD2_BLOCK_LIGHT,
                0,
                id,
                &light_body(
                    name,
                    0,
                    AWD2_LIGHT_TYPE_POINT,
                    &IDENTITY,
                    false,
                    &[
                        (AWD2_LIGHT_PROP_RADIUS, 10.0_f32.to_le_bytes().to_vec()),
                        (AWD2_LIGHT_PROP_SPECULAR, specular.to_le_bytes().to_vec()),
                    ],
                ),
            ));
        }
        blocks.push(block(
            AWD2_BLOCK_LIGHT,
            0,
            3,
            &light_body(
                "Odd",
                0,
                7,
                &IDENTITY,
                false,
                &[(AWD2_LIGHT_PROP_AMBIENT, 0.5_f32.to_le_bytes().to_vec())],
            ),
        ));
        let (document, diagnostics) = parse_lights(&blocks);
        assert_eq!(document.read().unwrap().lights.len(), 2);
        assert_eq!(
            diagnostics
                .iter()
                .map(|row| row.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "awd2.light-radius-dropped",
                "awd2.light-specular-dropped",
                "awd2.light-unsupported-type"
            ]
        );
        for (index, count, first) in [(0, 2.0, "First"), (1, 2.0, "First"), (2, 1.0, "Odd")] {
            let crumb = &diagnostics[index];
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(crumb.origin, "buildAwdDocumentLights");
            let detail = crumb.detail.as_ref().unwrap();
            assert_eq!(detail["count"], ImportDiagnosticDetailValue::Number(count));
            assert_eq!(
                detail["firstLight"],
                ImportDiagnosticDetailValue::String(first.to_string())
            );
            assert_eq!(detail.contains_key("firstSpecular"), index == 1);
            assert_eq!(detail.contains_key("firstType"), index == 2);
        }
        assert_eq!(
            diagnostics[1].detail.as_ref().unwrap()["firstSpecular"],
            ImportDiagnosticDetailValue::Number(0.5)
        );
        assert_eq!(
            diagnostics[2].detail.as_ref().unwrap()["firstType"],
            ImportDiagnosticDetailValue::Number(7.0)
        );
    }

    #[test]
    fn preserves_directional_shadow_wide_property_parent_and_partial_picker_source_assertions() {
        let properties = [
            (AWD2_LIGHT_PROP_DIFFUSE, 0.125_f64.to_le_bytes().to_vec()),
            (AWD2_LIGHT_PROP_AMBIENT, 0.375_f64.to_le_bytes().to_vec()),
            (AWD2_LIGHT_PROP_SHADOW_MAPPER, vec![1]),
        ];
        let (document, diagnostics) = parse_lights(&[
            block(
                AWD2_BLOCK_CONTAINER,
                0,
                4,
                &scene_header("Rig", 0, &IDENTITY, false),
            ),
            block(
                AWD2_BLOCK_LIGHT,
                0,
                5,
                &light_body(
                    "Sun",
                    4,
                    AWD2_LIGHT_TYPE_DIRECTIONAL,
                    &IDENTITY,
                    false,
                    &properties,
                ),
            ),
        ]);
        assert!(diagnostics.is_empty());
        let document = document.read().unwrap();
        assert_eq!(document.nodes[0].name.as_deref(), Some("Rig"));
        assert_eq!(document.lights.len(), 2);
        assert_eq!(document.lights[0].node, Some(0));
        assert_eq!(document.lights[1].node, Some(0));
        let direct = document.lights[0].descriptor.read().unwrap();
        let direct = (&*direct as &dyn Any)
            .downcast_ref::<DirectionalLight>()
            .unwrap();
        assert_eq!(direct.intensity, 0.125);
        assert!(direct.casts_shadow);
        let ambient = document.lights[1].descriptor.read().unwrap();
        assert_eq!(
            (&*ambient as &dyn Any)
                .downcast_ref::<AmbientLight>()
                .unwrap()
                .intensity,
            0.375
        );
        let (document, diagnostics) = parse_lights(&[
            block(
                AWD2_BLOCK_LIGHT,
                0,
                1,
                &light_body("Sun", 0, AWD2_LIGHT_TYPE_DIRECTIONAL, &IDENTITY, false, &[]),
            ),
            block(
                AWD2_BLOCK_LIGHT,
                0,
                2,
                &light_body(
                    "Fill",
                    0,
                    AWD2_LIGHT_TYPE_DIRECTIONAL,
                    &IDENTITY,
                    false,
                    &[],
                ),
            ),
            block(AWD2_BLOCK_LIGHT_PICKER, 0, 3, &picker_body("Partial", &[1])),
        ]);
        assert_eq!(document.read().unwrap().lights.len(), 2);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "awd2.light-scope-dropped");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(diagnostics[0].origin, "parseAwd2");
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap()["lights"],
            ImportDiagnosticDetailValue::Number(2.0)
        );
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap()["pickers"],
            ImportDiagnosticDetailValue::Number(1.0)
        );
    }
}

mod awd2_light_picker_handler {
    use super::*;

    #[test]
    fn claims_pickers_with_real_parse_and_lighting_build_callbacks() {
        let handler = AWD2_LIGHT_PICKER_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_LIGHT_PICKER]);
        assert_eq!(handler.build_phase, Some(AWD2_BUILD_PHASE_LIGHTING as f32));
        assert!(handler.build.is_some());
        assert_ne!(handler.deferred, Some(true));
    }

    #[test]
    fn compares_unique_picker_sets_to_the_full_light_set_and_reports_dangling_ids_before_scope_loss()
     {
        let light = block(
            AWD2_BLOCK_LIGHT,
            0,
            1,
            &light_body("Sun", 0, AWD2_LIGHT_TYPE_DIRECTIONAL, &IDENTITY, false, &[]),
        );
        for ids in [vec![], vec![1], vec![1, 1], vec![1, 77], vec![77]] {
            let (document, diagnostics) = parse_lights(&[
                light.clone(),
                block(AWD2_BLOCK_LIGHT_PICKER, 0, 2, &picker_body("Picker", &ids)),
            ]);
            assert_eq!(document.read().unwrap().lights.len(), 1);
            let has_missing = ids.contains(&77);
            let loses_scope = ids != [1] && ids != [1, 1];
            assert_eq!(
                diagnostics.len(),
                usize::from(has_missing) + usize::from(loses_scope)
            );
            if has_missing {
                let crumb = &diagnostics[0];
                assert_eq!(crumb.kind, "awd2.light-picker-missing-light");
                assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
                assert_eq!(crumb.origin, "parseAwd2");
                let detail = crumb.detail.as_ref().unwrap();
                assert_eq!(detail["block"], ImportDiagnosticDetailValue::Number(2.0));
                assert_eq!(detail["light"], ImportDiagnosticDetailValue::Number(77.0));
            }
            if loses_scope {
                let crumb = diagnostics.last().unwrap();
                assert_eq!(crumb.kind, "awd2.light-scope-dropped");
                assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
                assert_eq!(crumb.origin, "parseAwd2");
                let detail = crumb.detail.as_ref().unwrap();
                assert_eq!(detail["lights"], ImportDiagnosticDetailValue::Number(1.0));
                assert_eq!(detail["pickers"], ImportDiagnosticDetailValue::Number(1.0));
            }
        }
        let (document, diagnostics) = parse_lights(&[block(
            AWD2_BLOCK_LIGHT_PICKER,
            0,
            2,
            &picker_body("Picker", &[77]),
        )]);
        assert!(document.read().unwrap().lights.is_empty());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "awd2.light-picker-missing-light");
        let (_, diagnostics) = parse_lights(&[light]);
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn preserves_every_light_and_picker_truncation_field_on_the_public_document_path() {
        let light = light_body("", 0, AWD2_LIGHT_TYPE_POINT, &IDENTITY, false, &[]);
        let picker = picker_body("", &[1]);
        for (kind, body, cut, field, lights) in [
            (AWD2_BLOCK_LIGHT, light.as_slice(), 0, "parentId", None),
            (AWD2_BLOCK_LIGHT, light.as_slice(), 4, "transform", None),
            (AWD2_BLOCK_LIGHT, light.as_slice(), 52, "name", None),
            (AWD2_BLOCK_LIGHT, light.as_slice(), 54, "lightType", None),
            (AWD2_BLOCK_LIGHT_PICKER, picker.as_slice(), 0, "name", None),
            (
                AWD2_BLOCK_LIGHT_PICKER,
                picker.as_slice(),
                2,
                "numLights",
                None,
            ),
            (
                AWD2_BLOCK_LIGHT_PICKER,
                picker.as_slice(),
                4,
                "lightIds",
                Some(1.0),
            ),
        ] {
            let (document, diagnostics) = parse_lights(&[block(kind, 0, 1, &body[..cut])]);
            assert!(document.read().unwrap().lights.is_empty());
            assert_eq!(diagnostics.len(), 1);
            let crumb = &diagnostics[0];
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(
                crumb.kind,
                if kind == AWD2_BLOCK_LIGHT {
                    "awd2.light-truncated"
                } else {
                    "awd2.light-picker-truncated"
                }
            );
            assert_eq!(
                crumb.origin,
                if kind == AWD2_BLOCK_LIGHT {
                    "parseLightBlock"
                } else {
                    "parseLightPickerBlock"
                }
            );
            let detail = crumb.detail.as_ref().unwrap();
            assert_eq!(
                detail["field"],
                ImportDiagnosticDetailValue::String(field.to_string())
            );
            assert_eq!(
                detail.get("lights"),
                lights.map(ImportDiagnosticDetailValue::Number).as_ref()
            );
            assert!(!detail.contains_key("bytes"));
        }
    }
}
