use std::sync::Arc;

use flight_node::{NodeRef, get_node_child_at, get_node_child_count};
use flight_path_boolean::MARTINEZ_PATH_BOOLEAN_KERNEL;
use flight_scene2d::{DISPLAY_OBJECT_KIND, Node2DRef, as_node2d_ref};
use flight_scene2d_formats::contract::*;

use crate::rive_test_bytes::{TestObject, build_rive, float, object, text, uint};

struct NodeSnapshot {
    alpha: f32,
    blend_mode: Option<String>,
    kind: String,
    name: Option<String>,
    pivot_x: f32,
    pivot_y: f32,
    rotation: f32,
    scale_x: f32,
    scale_y: f32,
    x: f32,
    y: f32,
}

const ARTBOARD: u64 = 1;
const BLEND_MODE: u64 = 23;
const DRAWABLE: i32 = 13;
const FILL: u64 = 20;
const HEIGHT: u64 = 8;
const LAYOUT_COMPONENT: i32 = 409;
const NAME: u64 = 4;
const NESTED_ARTBOARD: i32 = 92;
const NESTED_ARTBOARD_LEAF: u64 = 451;
const NODE: u64 = 2;
const N_SLICED_NODE: u64 = 508;
const OPACITY: u64 = 18;
const ORIGIN_X: u64 = 11;
const ORIGIN_Y: u64 = 12;
const PARENT_ID: u64 = 5;
const POINTS_PATH: u64 = 16;
const ROOT_BONE: u64 = 41;
const ROTATION: u64 = 15;
const SCALE_X: u64 = 16;
const SCALE_Y: u64 = 17;
const SHAPE: u64 = 3;
const TEXT_INPUT: u64 = 569;
const WIDTH: u64 = 7;
const X: u64 = 13;
const X_LEGACY: u64 = 9;
const Y: u64 = 14;

mod create_scene2d_from_rive_document {
    use super::*;

    #[test]
    fn accepts_the_retired_position_key_files_still_write() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(NODE, vec![uint(PARENT_ID, 0), float(X_LEGACY, 33.0)]),
        ]);
        assert_f32_eq(fields(&child(&result.artboards[0].root, 0)).x, 33.0, 0.0);
    }

    #[test]
    fn applies_the_format_defaults_for_omitted_properties() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(NODE, vec![uint(PARENT_ID, 0)]),
        ]);
        let node = child(&result.artboards[0].root, 0);
        let node = fields(&node);
        assert_f32_eq(node.alpha, 1.0, 0.0);
        assert_f32_eq(node.rotation, 0.0, 0.0);
        assert_f32_eq(node.scale_x, 1.0, 0.0);
        assert_f32_eq(node.scale_y, 1.0, 0.0);
        assert_f32_eq(node.x, 0.0, 0.0);
        assert_f32_eq(node.y, 0.0, 0.0);
    }

    #[test]
    fn carries_no_skeleton_for_an_artboard_without_bones() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(NODE, vec![uint(PARENT_ID, 0)]),
        ]);
        assert!(result.artboards[0].skeleton.is_none());
    }

    #[test]
    fn carries_the_artboard_bone_rig_beside_the_display_tree() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(ROOT_BONE, vec![uint(PARENT_ID, 0), text(NAME, "root")]),
        ]);
        let skeleton = result.artboards[0].skeleton.as_ref().unwrap();
        assert_eq!(skeleton.skeleton.bones[0].name.as_deref(), Some("root"));
        assert_eq!(child_count(&result.artboards[0].root), 0);
    }

    #[test]
    fn converts_advanced_blend_modes_into_sidecar_effects() {
        let advanced = [
            (15, "Overlay"),
            (18, "ColorDodge"),
            (19, "ColorBurn"),
            (20, "HardLight"),
            (21, "SoftLight"),
            (22, "Difference"),
            (23, "Exclusion"),
            (25, "Hue"),
            (26, "Saturation"),
            (27, "Color"),
            (28, "Luminosity"),
        ];
        let mut objects = vec![board("Board", 10.0, 10.0)];
        objects.extend(
            advanced.iter().map(|(value, _)| {
                object(SHAPE, vec![uint(PARENT_ID, 0), uint(BLEND_MODE, *value)])
            }),
        );
        let result = import(objects);
        let artboard = &result.artboards[0];
        assert_eq!(
            artboard
                .advanced_blends
                .iter()
                .map(|entry| entry.mode.as_str())
                .collect::<Vec<_>>(),
            advanced.iter().map(|(_, name)| *name).collect::<Vec<_>>()
        );
        for index in 0..advanced.len() {
            assert_eq!(
                fields(&child(&artboard.root, index as i32))
                    .blend_mode
                    .as_deref(),
                Some("Normal")
            );
        }
        assert!(Arc::ptr_eq(
            &artboard.advanced_blends[0].node,
            &child(&artboard.root, 0)
        ));
    }

    #[test]
    fn converts_fixed_function_blend_modes() {
        let modes = [
            (3, "Normal"),
            (14, "Screen"),
            (16, "Darken"),
            (17, "Lighten"),
            (24, "Multiply"),
        ];
        let mut objects = vec![board("Board", 10.0, 10.0)];
        objects.extend(
            modes.iter().map(|(value, _)| {
                object(SHAPE, vec![uint(PARENT_ID, 0), uint(BLEND_MODE, *value)])
            }),
        );
        let result = import(objects);
        for (index, (_, expected)) in modes.iter().enumerate() {
            assert_eq!(
                fields(&child(&result.artboards[0].root, index as i32))
                    .blend_mode
                    .as_deref(),
                Some(*expected)
            );
        }
        assert!(result.artboards[0].advanced_blends.is_empty());
    }

    #[test]
    fn converts_the_artboard_origin_into_a_pivot_in_artboard_units() {
        let result = import(vec![object(
            ARTBOARD,
            vec![
                float(WIDTH, 400.0),
                float(HEIGHT, 300.0),
                float(ORIGIN_X, 0.5),
                float(ORIGIN_Y, 1.0),
            ],
        )]);
        let root = fields(&result.artboards[0].root);
        assert_f32_eq(root.pivot_x, 200.0, 0.0);
        assert_f32_eq(root.pivot_y, 300.0, 0.0);
    }

    #[test]
    fn imports_each_artboard_with_its_name_and_size() {
        let result = import(vec![
            board("First", 400.0, 300.0),
            board("Second", 120.0, 60.0),
        ]);
        assert_eq!(result.artboards.len(), 2);
        assert_eq!(result.artboards[0].name, "First");
        assert_f32_eq(result.artboards[0].width, 400.0, 0.0);
        assert_f32_eq(result.artboards[0].height, 300.0, 0.0);
        assert_eq!(
            fields(&result.artboards[0].root).name.as_deref(),
            Some("First")
        );
        assert_eq!(result.artboards[1].name, "Second");
    }

    #[test]
    fn leaves_a_plain_nodes_blend_mode_alone() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(NODE, vec![uint(PARENT_ID, 0), uint(BLEND_MODE, 24)]),
        ]);
        assert!(
            fields(&child(&result.artboards[0].root, 0))
                .blend_mode
                .is_none()
        );
    }

    #[test]
    fn makes_display_objects_only_for_components_that_are_nodes() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(SHAPE, vec![uint(PARENT_ID, 0), text(NAME, "shape")]),
            object(FILL, vec![uint(PARENT_ID, 1)]),
        ]);
        assert_eq!(child_count(&result.artboards[0].root), 1);
        assert_eq!(child_count(&child(&result.artboards[0].root, 0)), 0);
    }

    #[test]
    fn marks_a_nested_artboard_subclass_as_a_slot_without_a_diagnostic() {
        let mut diagnostics = Vec::new();
        let result = import_with_diagnostics(
            vec![
                board("Board", 10.0, 10.0),
                object(NESTED_ARTBOARD_LEAF, vec![uint(PARENT_ID, 0)]),
            ],
            &mut diagnostics,
        );
        assert_eq!(child_count(&result.artboards[0].root), 1);
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn nests_nodes_the_way_the_component_tree_states() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(NODE, vec![uint(PARENT_ID, 0), text(NAME, "parent")]),
            object(NODE, vec![uint(PARENT_ID, 1), text(NAME, "child")]),
        ]);
        let root = &result.artboards[0].root;
        let parent = child(root, 0);
        assert_eq!(child_count(root), 1);
        assert_eq!(fields(&parent).name.as_deref(), Some("parent"));
        assert_eq!(fields(&child(&parent, 0)).name.as_deref(), Some("child"));
    }

    #[test]
    fn reads_the_transform_a_node_states() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(
                NODE,
                vec![
                    uint(PARENT_ID, 0),
                    text(NAME, "moved"),
                    float(X, 12.0),
                    float(Y, -7.0),
                    float(SCALE_X, 2.0),
                    float(SCALE_Y, 0.5),
                    float(OPACITY, 0.25),
                ],
            ),
        ]);
        let node = child(&result.artboards[0].root, 0);
        let node = fields(&node);
        assert_eq!(node.name.as_deref(), Some("moved"));
        assert_f32_eq(node.x, 12.0, 0.0);
        assert_f32_eq(node.y, -7.0, 0.0);
        assert_f32_eq(node.scale_x, 2.0, 0.0);
        assert_f32_eq(node.scale_y, 0.5, 0.0);
        assert_f32_eq(node.alpha, 0.25, 0.0);
    }

    #[test]
    fn reparents_past_a_non_node_ancestor() {
        let result = import(vec![
            board("Board", 10.0, 10.0),
            object(FILL, vec![uint(PARENT_ID, 0)]),
            object(NODE, vec![uint(PARENT_ID, 1), text(NAME, "orphaned")]),
        ]);
        assert_eq!(child_count(&result.artboards[0].root), 1);
        assert_eq!(
            fields(&child(&result.artboards[0].root, 0)).name.as_deref(),
            Some("orphaned")
        );
    }

    #[test]
    fn reports_a_drawable_kind_it_does_not_build() {
        let mut diagnostics = Vec::new();
        let result = import_with_diagnostics(
            vec![
                board("Board", 10.0, 10.0),
                object(TEXT_INPUT, vec![uint(PARENT_ID, 0)]),
            ],
            &mut diagnostics,
        );
        assert_eq!(child_count(&result.artboards[0].root), 1);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.drawable-kind-unsupported");
    }

    #[test]
    fn reports_a_path_that_is_not_owned_by_a_shape() {
        let mut diagnostics = Vec::new();
        import_with_diagnostics(
            vec![
                board("Board", 10.0, 10.0),
                object(NODE, vec![uint(PARENT_ID, 0)]),
                object(POINTS_PATH, vec![uint(PARENT_ID, 1)]),
            ],
            &mut diagnostics,
        );
        assert_eq!(
            diagnostics
                .iter()
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            ["rive.path-outside-shape"]
        );
    }

    #[test]
    fn reports_a_nine_sliced_node_imported_as_a_container() {
        let mut diagnostics = Vec::new();
        let result = import_with_diagnostics(
            vec![
                board("Board", 10.0, 10.0),
                object(N_SLICED_NODE, vec![uint(PARENT_ID, 0)]),
            ],
            &mut diagnostics,
        );
        assert_eq!(child_count(&result.artboards[0].root), 1);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.nine-slice-substituted");
    }

    #[test]
    fn returns_no_artboards_for_bytes_that_are_not_a_rive_file() {
        assert!(
            create_scene2d_from_rive_document(&MARTINEZ_PATH_BOOLEAN_KERNEL, &[1, 2, 3, 4], None)
                .artboards
                .is_empty()
        );
    }

    #[test]
    fn stays_silent_for_plain_container_nodes() {
        let mut diagnostics = Vec::new();
        let result = import_with_diagnostics(
            vec![
                board("Board", 10.0, 10.0),
                object(NODE, vec![uint(PARENT_ID, 0)]),
                object(LAYOUT_COMPONENT as u64, vec![uint(PARENT_ID, 0)]),
            ],
            &mut diagnostics,
        );
        assert_eq!(child_count(&result.artboards[0].root), 2);
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn writes_rotation_in_degrees_from_radians() {
        let result = import(vec![
            board("Board", 100.0, 100.0),
            object(
                NODE,
                vec![
                    uint(PARENT_ID, 0),
                    float(ROTATION, std::f32::consts::FRAC_PI_2),
                ],
            ),
            object(
                NODE,
                vec![uint(PARENT_ID, 0), float(ROTATION, std::f32::consts::PI)],
            ),
        ]);
        assert_f32_close4(fields(&child(&result.artboards[0].root, 0)).rotation, 90.0);
        assert_f32_close4(fields(&child(&result.artboards[0].root, 1)).rotation, 180.0);
    }

    #[test]
    fn draws_or_reports_every_non_layout_non_slot_drawable() {
        let mut unreported = Vec::new();
        for type_key in 0..1200 {
            let Some(name) = get_rive_core_type_name(type_key) else {
                continue;
            };
            if !is_rive_core_type_derived_from(type_key, DRAWABLE)
                || is_rive_core_type_derived_from(type_key, LAYOUT_COMPONENT)
                || is_rive_core_type_derived_from(type_key, NESTED_ARTBOARD)
            {
                continue;
            }
            let mut diagnostics = Vec::new();
            let result = import_with_diagnostics(
                vec![
                    board("Board", 10.0, 10.0),
                    object(type_key as u64, vec![uint(PARENT_ID, 0)]),
                ],
                &mut diagnostics,
            );
            let root = &result.artboards[0].root;
            let drew = child_count(root) > 0 && fields(&child(root, 0)).kind != DISPLAY_OBJECT_KIND;
            let reported = diagnostics
                .iter()
                .any(|entry| entry.kind == "rive.drawable-kind-unsupported");
            if !drew && !reported {
                unreported.push(format!("{name}({type_key})"));
            }
        }
        assert!(
            unreported.is_empty(),
            "unreported drawables: {unreported:?}"
        );
    }
}

fn assert_f32_close4(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0.00005)
    let bound = 0.00005_f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        (actual - expected).abs() <= bound,
        "{actual} != {expected} within {bound}"
    );
}

fn assert_f32_eq(actual: f32, expected: f32, _original_bound: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!(
        (actual - expected).abs() <= bound,
        "{actual} != {expected} within {bound}"
    );
}

fn board(name: &str, width: f32, height: f32) -> TestObject {
    return object(
        ARTBOARD,
        vec![text(NAME, name), float(WIDTH, width), float(HEIGHT, height)],
    );
}

fn child(node: &Node2DRef, index: i32) -> Node2DRef {
    let node_ref: NodeRef = node.clone();
    return as_node2d_ref(&get_node_child_at(&node_ref, index).unwrap()).unwrap();
}

fn child_count(node: &Node2DRef) -> usize {
    let node_ref: NodeRef = node.clone();
    return get_node_child_count(&node_ref);
}

fn fields(node: &Node2DRef) -> NodeSnapshot {
    let guard = node.read().unwrap();
    let fields = guard.node2d_fields();
    return NodeSnapshot {
        alpha: fields.alpha,
        blend_mode: fields.blend_mode.clone(),
        kind: fields.kind.clone(),
        name: fields.name.clone(),
        pivot_x: fields.pivot_x,
        pivot_y: fields.pivot_y,
        rotation: fields.rotation,
        scale_x: fields.scale_x,
        scale_y: fields.scale_y,
        x: fields.x,
        y: fields.y,
    };
}

fn import(objects: Vec<TestObject>) -> RiveDocumentImportResult {
    return create_scene2d_from_rive_document(
        &MARTINEZ_PATH_BOOLEAN_KERNEL,
        &build_rive(objects),
        None,
    );
}

fn import_with_diagnostics(
    objects: Vec<TestObject>,
    diagnostics: &mut Vec<flight_importdiagnostics::ImportDiagnostic>,
) -> RiveDocumentImportResult {
    return create_scene2d_from_rive_document(
        &MARTINEZ_PATH_BOOLEAN_KERNEL,
        &build_rive(objects),
        Some(diagnostics),
    );
}
