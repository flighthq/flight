use super::awd2_test_helper::{block, file, property_list, scene_header};
use flight_camera::Projection;
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

const IDENTITY: [f64; 12] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

fn camera_body(
    name: &str,
    parent: u32,
    projection: i16,
    props: &[(u16, Vec<u8>)],
    transform: &[f64; 12],
    wide: bool,
) -> Vec<u8> {
    let mut bytes = scene_header(name, parent, transform, wide);
    bytes.extend_from_slice(&[1, 0, 0]);
    bytes.extend_from_slice(&projection.to_le_bytes());
    bytes.extend_from_slice(&property_list(props));
    bytes.extend_from_slice(&[0; 8]);
    return bytes;
}

fn parse_cameras(
    body: &[u8],
    wide: bool,
) -> (
    Ref<flight_scene3d::Scene3DDocument>,
    Vec<flight_importdiagnostics::ImportDiagnostic>,
) {
    let mut record = block(42, 0, 1, body);
    record[6] = u8::from(wide);
    let input = Arc::new(RwLock::new(file(&[record]).into_boxed_slice()));
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_awd2(
        &input,
        &Awd2ParseOptions {
            blocks: vec![AWD2_CAMERA_HANDLER.clone()],
            deflate: None,
            lzma: None,
        },
        Some(&diagnostics),
    );
    let diagnostics = diagnostics.read().unwrap().clone();
    return (document, diagnostics);
}

mod awd2_camera_handler {
    use super::*;

    #[test]
    fn claims_the_original_camera_block_and_declares_its_parse_and_build_phase() {
        let handler = AWD2_CAMERA_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_CAMERA]);
        assert_eq!(handler.build_phase, Some(AWD2_BUILD_PHASE_CAMERA as f32));
        assert!(handler.build.is_some());
        assert_ne!(handler.deferred, Some(true));
    }

    #[test]
    fn imports_vertical_fov_ecosystem_defaults_and_left_to_right_handed_placement_for_both_transform_widths()
     {
        for wide in [false, true] {
            for authored in [None, Some(45.0_f32)] {
                let props = authored
                    .map(|v| vec![(AWD2_CAMERA_PROP_FOV, v.to_le_bytes().to_vec())])
                    .unwrap_or_else(Vec::new);
                let mut transform = IDENTITY;
                transform[9..].copy_from_slice(&[7.0, 8.0, 9.0]);
                let (document, diagnostics) = parse_cameras(
                    &camera_body(
                        "Cam",
                        0,
                        AWD2_CAMERA_PROJECTION_PERSPECTIVE,
                        &props,
                        &transform,
                        wide,
                    ),
                    wide,
                );
                assert!(diagnostics.is_empty());
                let document = document.read().unwrap();
                assert_eq!(document.cameras.len(), 1);
                assert!(document.nodes.is_empty());
                assert!(document.scenes[0].root_nodes.is_empty());
                let camera = &document.cameras[0];
                assert_eq!(camera.name.as_deref(), Some("Cam"));
                assert_eq!(camera.node, None);
                assert_eq!(camera.near, 20.0);
                assert_eq!(camera.far, 3000.0);
                let Projection::Perspective(projection) = &camera.projection else {
                    panic!("perspective");
                };
                let projection = projection.read().unwrap();
                assert_eq!(projection.aspect, 1.0);
                assert!((projection.fov_y - authored.unwrap_or(60.0).to_radians()).abs() < 1e-6);
                assert_eq!(
                    [
                        camera.transform.position.x,
                        camera.transform.position.y,
                        camera.transform.position.z
                    ],
                    [7.0, 8.0, -9.0]
                );
            }
        }
    }

    #[test]
    fn imports_unit_orthographic_and_offcenter_extents_and_reports_only_authored_asymmetry() {
        let cases = [
            (
                AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC,
                Vec::new(),
                [0.5, 0.5],
                false,
            ),
            (
                AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER,
                vec![
                    (101, (-200.0_f32).to_le_bytes().to_vec()),
                    (102, 200.0_f32.to_le_bytes().to_vec()),
                    (103, (-100.0_f32).to_le_bytes().to_vec()),
                    (104, 100.0_f32.to_le_bytes().to_vec()),
                ],
                [200.0, 100.0],
                false,
            ),
            (
                AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER,
                vec![
                    (101, 0.0_f32.to_le_bytes().to_vec()),
                    (102, 400.0_f32.to_le_bytes().to_vec()),
                    (103, (-300.0_f32).to_le_bytes().to_vec()),
                    (104, 300.0_f32.to_le_bytes().to_vec()),
                ],
                [200.0, 300.0],
                true,
            ),
            (
                AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER,
                Vec::new(),
                [400.0, 300.0],
                false,
            ),
        ];
        for (kind, props, extent, asymmetric) in cases {
            let (document, diagnostics) = parse_cameras(
                &camera_body("Cam", 0, kind, &props, &IDENTITY, false),
                false,
            );
            let document = document.read().unwrap();
            let Projection::Orthographic(projection) = &document.cameras[0].projection else {
                panic!("orthographic");
            };
            let projection = projection.read().unwrap();
            assert_eq!([projection.half_width, projection.half_height], extent);
            assert_eq!(diagnostics.len(), usize::from(asymmetric));
            if asymmetric {
                assert_eq!(diagnostics[0].kind, "awd2.camera-offcenter-dropped");
                assert_eq!(diagnostics[0].origin, "parseAwd2");
                assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
                assert_eq!(
                    diagnostics[0].detail.as_ref().unwrap()["name"],
                    ImportDiagnosticDetailValue::String("Cam".to_string())
                );
            }
        }
    }

    #[test]
    fn skips_unknown_signed_projection_types_and_preserves_each_header_truncation_reason() {
        for kind in [9999, -1] {
            let (document, diagnostics) =
                parse_cameras(&camera_body("Cam", 0, kind, &[], &IDENTITY, false), false);
            assert!(document.read().unwrap().cameras.is_empty());
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, "awd2.camera-unsupported-projection");
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(diagnostics[0].origin, "parseAwd2");
            assert_eq!(
                diagnostics[0].detail.as_ref().unwrap()["projectionType"],
                ImportDiagnosticDetailValue::Number(kind as f32)
            );
        }
        let body = camera_body("Cam", 0, 5001, &[], &IDENTITY, false);
        for (cut, field) in [
            (0, "parentId"),
            (4, "transform"),
            (52, "name"),
            (53, "name"),
            (54, "name"),
            (57, "projectionType"),
            (61, "projectionType"),
        ] {
            let (document, diagnostics) = parse_cameras(&body[..cut], false);
            assert!(document.read().unwrap().cameras.is_empty());
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, "awd2.camera-truncated");
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(diagnostics[0].origin, "parseCameraBlock");
            assert_eq!(
                diagnostics[0].detail.as_ref().unwrap()["field"],
                ImportDiagnosticDetailValue::String(field.to_string())
            );
        }
    }

    #[test]
    fn builds_after_parent_mapping_and_replaces_duplicate_block_ids_without_changing_discovery_order()
     {
        let parent =
            Arc::new(RwLock::new(Awd2BlockHandler {
                block_types: Vec::new(),
                build_phase: Some(AWD2_BUILD_PHASE_SCENE_STRUCTURE as f32),
                deferred: None,
                parse: Arc::new(|_, _| {}),
                build: Some(Arc::new(|state| {
                    state.document.write().unwrap().nodes.push(
                        flight_scene3d::Scene3DDocumentNode {
                            children: Vec::new(),
                            kind: flight_scene3d::NODE3D_KIND.to_string(),
                            mesh: None,
                            name: Some("Parent".to_string()),
                            transform: flight_geometry::contract::create_transform3d(),
                        },
                    );
                    state
                        .node_index_for_block
                        .push(Awd2NodeIndexEntry { key: 99, value: 0 });
                })),
            }));
        let input = Arc::new(RwLock::new(
            file(&[
                block(
                    42,
                    0,
                    1,
                    &camera_body("first", 99, 5001, &[], &IDENTITY, false),
                ),
                block(42, 0, 2, &camera_body("", 0, 5001, &[], &IDENTITY, false)),
                block(
                    42,
                    0,
                    1,
                    &camera_body("replacement", 99, 5001, &[], &IDENTITY, false),
                ),
            ])
            .into_boxed_slice(),
        ));
        let document = parse_awd2(
            &input,
            &Awd2ParseOptions {
                blocks: vec![AWD2_CAMERA_HANDLER.clone(), parent],
                deflate: None,
                lzma: None,
            },
            None,
        );
        let document = document.read().unwrap();
        assert_eq!(document.cameras.len(), 2);
        assert_eq!(document.cameras[0].name.as_deref(), Some("replacement"));
        assert_eq!(document.cameras[0].node, Some(0));
        assert_eq!(document.cameras[1].name, None);
        assert_eq!(document.cameras[1].node, None);
    }
}
