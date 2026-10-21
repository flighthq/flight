use std::sync::Arc;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_layout::{
    ContainerStyle, FlexAlignSelf, FlexBasis, FlexLayoutAlign, FlexLayoutDirection,
    FlexLayoutJustify, FlexLayoutWrap, GridLayoutTrack, ItemStyle, FLEX_LAYOUT_KIND,
    GRID_LAYOUT_KIND,
};
use flight_scene2d::{create_display_object, Node2DRef};
use flight_scene2d_formats::contract::*;

const ARTBOARD: u64 = 1;
const SHAPE: u64 = 3;
const SOLO: u64 = 147;
const LAYOUT_COMPONENT: u64 = 409;
const LAYOUT_COMPONENT_STYLE: u64 = 420;
const GRID_TRACK: u64 = 1058;
const LAYOUT_PARTICIPANT: u64 = 1066;
const GRID_ITEM_PLACEMENT: u64 = 1068;

const NAME: u64 = 4;
const WIDTH: u64 = 7;
const STYLE_ID: u64 = 494;
const SOLO_ACTIVE_COMPONENT: u64 = 296;
const GAP_HORIZONTAL: u64 = 498;
const BORDER_LEFT: u64 = 504;
const PADDING_LEFT: u64 = 512;
const FLEX_BASIS: u64 = 523;
const FLEX_DIRECTION: u64 = 598;
const BORDER_LEFT_UNITS: u64 = 609;
const PADDING_LEFT_UNITS: u64 = 617;
const GAP_HORIZONTAL_UNITS: u64 = 625;
const LAYOUT_ALIGNMENT: u64 = 632;
const WIDTH_SCALE: u64 = 655;
const HEIGHT_SCALE: u64 = 656;
const FLEX_BASIS_UNITS: u64 = 705;
const FRACTIONAL_WIDTH: u64 = 706;
const GRID_COLUMN: u64 = 1047;
const GRID_ROW: u64 = 1048;
const GRID_COLUMN_SPAN: u64 = 1049;
const PARTICIPANT_FRACTIONAL_WIDTH: u64 = 1057;
const LAYOUT_TYPE: u64 = 1059;
const GRID_TRACK_COLLECTION: u64 = 1061;
const GRID_TRACK_TYPE: u64 = 1062;
const GRID_TRACK_VALUE: u64 = 1063;
const PARTICIPANT_WIDTH: u64 = 1066;
const PARTICIPANT_HEIGHT: u64 = 1067;

struct TestScene {
    graph: RiveArtboardGraph,
    nodes: Vec<Option<Node2DRef>>,
}

mod create_rive_layout_imports {
    use super::*;

    #[test]
    fn maps_a_flex_root_and_participant_while_leaving_intrinsic_measurements_to_the_caller() {
        let scene = build(
            vec![
                object(ARTBOARD, &[(STYLE_ID, 1.0)]),
                object(
                    LAYOUT_COMPONENT_STYLE,
                    &[
                        (FLEX_DIRECTION, 2.0),
                        (LAYOUT_ALIGNMENT, 4.0),
                        (GAP_HORIZONTAL, 12.0),
                        (GAP_HORIZONTAL_UNITS, 1.0),
                        (PADDING_LEFT, 5.0),
                        (PADDING_LEFT_UNITS, 1.0),
                        (BORDER_LEFT, 2.0),
                        (BORDER_LEFT_UNITS, 1.0),
                    ],
                ),
                object(SHAPE, &[]),
                object(
                    LAYOUT_PARTICIPANT,
                    &[
                        (WIDTH_SCALE, 1.0),
                        (HEIGHT_SCALE, 1.0),
                        (PARTICIPANT_FRACTIONAL_WIDTH, 2.5),
                    ],
                ),
            ],
            vec![-1, 0, 0, 2],
        );

        let imports = create_rive_layout_imports(&scene.graph, &scene.nodes, None);

        assert_eq!(imports.len(), 1);
        let layout = &imports[0];
        assert_eq!(layout.targets.len(), 2);
        assert_target(&layout.targets[0], &scene.nodes[0]);
        assert_target(&layout.targets[1], &scene.nodes[2]);
        assert_eq!(layout.tree.nodes.len(), 2);
        let root = &layout.tree.nodes[0];
        assert_eq!(root.kind, FLEX_LAYOUT_KIND);
        assert_eq!(root.parent_index, -1);
        assert!(matches!(root.item_style, ItemStyle::None));
        let ContainerStyle::Flex(style) = &root.container_style else {
            panic!("expected flex root");
        };
        assert_eq!(style.align, Some(FlexLayoutAlign::Center));
        assert_eq!(style.direction, Some(FlexLayoutDirection::Row));
        assert_f32(style.gap.unwrap(), 12.0);
        assert_eq!(style.justify, Some(FlexLayoutJustify::Center));
        assert_f32(style.padding_left.unwrap(), 7.0);
        assert_eq!(style.wrap, Some(FlexLayoutWrap::NoWrap));
        let child = &layout.tree.nodes[1];
        assert!(matches!(child.container_style, ContainerStyle::None));
        assert_eq!(child.kind, FLEX_LAYOUT_KIND);
        assert_eq!(child.parent_index, 0);
        let ItemStyle::Flex(style) = &child.item_style else {
            panic!("expected flex item");
        };
        assert_eq!(
            style.align_self,
            Some(FlexAlignSelf::Align(FlexLayoutAlign::Stretch)),
        );
        assert_flex_basis(style.basis, 0.0);
        assert_f32(style.grow.unwrap(), 2.5);
        assert_f32(style.shrink.unwrap(), 2.5);
    }

    #[test]
    fn keeps_a_nested_component_container_style_separate_from_its_parent_interpreted_item_style() {
        let scene = build(
            vec![
                object(ARTBOARD, &[(STYLE_ID, 1.0)]),
                object(LAYOUT_COMPONENT_STYLE, &[(FLEX_DIRECTION, 2.0)]),
                object(
                    LAYOUT_COMPONENT,
                    &[(STYLE_ID, 3.0), (WIDTH, 120.0), (FRACTIONAL_WIDTH, 3.0)],
                ),
                object(
                    LAYOUT_COMPONENT_STYLE,
                    &[
                        (FLEX_BASIS, 40.0),
                        (FLEX_BASIS_UNITS, 1.0),
                        (FLEX_DIRECTION, 0.0),
                        (WIDTH_SCALE, 1.0),
                    ],
                ),
                object(SHAPE, &[]),
                object(
                    LAYOUT_PARTICIPANT,
                    &[(PARTICIPANT_HEIGHT, 24.0), (PARTICIPANT_WIDTH, 16.0)],
                ),
            ],
            vec![-1, 0, 0, 2, 2, 4],
        );

        let imports = create_rive_layout_imports(&scene.graph, &scene.nodes, None);
        let layout = &imports[0];

        assert_eq!(layout.targets.len(), 3);
        assert_target(&layout.targets[0], &scene.nodes[0]);
        assert_target(&layout.targets[1], &scene.nodes[2]);
        assert_target(&layout.targets[2], &scene.nodes[4]);
        let nested = &layout.tree.nodes[1];
        assert_eq!(nested.kind, FLEX_LAYOUT_KIND);
        assert_eq!(nested.parent_index, 0);
        let ContainerStyle::Flex(container) = &nested.container_style else {
            panic!("expected nested flex container");
        };
        assert_eq!(container.align, Some(FlexLayoutAlign::Start));
        assert_eq!(container.direction, Some(FlexLayoutDirection::Column));
        assert_eq!(container.justify, Some(FlexLayoutJustify::Start));
        assert_eq!(container.wrap, Some(FlexLayoutWrap::NoWrap));
        let ItemStyle::Flex(item) = &nested.item_style else {
            panic!("expected nested flex item");
        };
        assert_eq!(item.align_self, Some(FlexAlignSelf::Auto));
        assert_flex_basis(item.basis, 40.0);
        assert_f32(item.grow.unwrap(), 3.0);
        assert_f32(item.shrink.unwrap(), 3.0);
        let child = &layout.tree.nodes[2];
        assert!(matches!(child.container_style, ContainerStyle::None));
        assert_eq!(child.kind, FLEX_LAYOUT_KIND);
        assert_eq!(child.parent_index, 1);
        let ItemStyle::Flex(item) = &child.item_style else {
            panic!("expected participant flex item");
        };
        assert_eq!(item.align_self, Some(FlexAlignSelf::Auto));
        assert_flex_basis(item.basis, 24.0);
        assert_f32(item.grow.unwrap(), 0.0);
        assert_f32(item.shrink.unwrap(), 0.0);
    }

    #[test]
    fn returns_a_component_below_a_non_layout_ancestor_as_an_independent_root() {
        let scene = build(
            vec![
                object(ARTBOARD, &[]),
                object(LAYOUT_COMPONENT, &[(STYLE_ID, 2.0)]),
                object(LAYOUT_COMPONENT_STYLE, &[(FLEX_DIRECTION, 2.0)]),
            ],
            vec![-1, 0, 1],
        );

        let imports = create_rive_layout_imports(&scene.graph, &scene.nodes, None);

        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].targets.len(), 1);
        assert_target(&imports[0].targets[0], &scene.nodes[1]);
        assert_eq!(imports[0].tree.nodes[0].parent_index, -1);
    }

    #[test]
    fn includes_only_the_active_provider_below_a_solo() {
        let scene = build(
            vec![
                object(ARTBOARD, &[(STYLE_ID, 1.0)]),
                object(LAYOUT_COMPONENT_STYLE, &[]),
                object(SOLO, &[(SOLO_ACTIVE_COMPONENT, 5.0)]),
                object(SHAPE, &[]),
                object(LAYOUT_PARTICIPANT, &[]),
                object(SHAPE, &[]),
                object(LAYOUT_PARTICIPANT, &[]),
            ],
            vec![-1, 0, 0, 2, 3, 2, 5],
        );

        let imports = create_rive_layout_imports(&scene.graph, &scene.nodes, None);
        let layout = &imports[0];

        assert_eq!(layout.targets.len(), 2);
        assert_target(&layout.targets[0], &scene.nodes[0]);
        assert_target(&layout.targets[1], &scene.nodes[5]);
        assert_eq!(layout.tree.nodes.len(), 2);
    }

    #[test]
    fn maps_explicit_grid_tracks_and_one_based_item_placement() {
        let scene = build(
            vec![
                object(ARTBOARD, &[(STYLE_ID, 1.0)]),
                object(LAYOUT_COMPONENT_STYLE, &[(LAYOUT_TYPE, 1.0)]),
                object(
                    GRID_TRACK,
                    &[
                        (GRID_TRACK_COLLECTION, 0.0),
                        (GRID_TRACK_TYPE, 1.0),
                        (GRID_TRACK_VALUE, 20.0),
                    ],
                ),
                object(
                    GRID_TRACK,
                    &[
                        (GRID_TRACK_COLLECTION, 0.0),
                        (GRID_TRACK_TYPE, 3.0),
                        (GRID_TRACK_VALUE, 2.0),
                    ],
                ),
                object(
                    GRID_TRACK,
                    &[(GRID_TRACK_COLLECTION, 0.0), (GRID_TRACK_TYPE, 0.0)],
                ),
                object(
                    GRID_TRACK,
                    &[(GRID_TRACK_COLLECTION, 1.0), (GRID_TRACK_TYPE, 0.0)],
                ),
                object(SHAPE, &[]),
                object(LAYOUT_PARTICIPANT, &[]),
                object(
                    GRID_ITEM_PLACEMENT,
                    &[(GRID_COLUMN, 2.0), (GRID_ROW, 1.0), (GRID_COLUMN_SPAN, 2.0)],
                ),
            ],
            vec![-1, 0, 0, 0, 0, 0, 0, 6, 6],
        );

        let imports = create_rive_layout_imports(&scene.graph, &scene.nodes, None);
        let nodes = &imports[0].tree.nodes;

        assert_eq!(nodes[0].kind, GRID_LAYOUT_KIND);
        let ContainerStyle::Grid(container) = &nodes[0].container_style else {
            panic!("expected grid root");
        };
        assert_eq!(container.columns.len(), 3);
        assert_fixed_track(&container.columns[0], 20.0);
        assert_fraction_track(&container.columns[1], 2.0);
        assert!(matches!(container.columns[2], GridLayoutTrack::Auto));
        assert_eq!(container.rows.len(), 1);
        assert!(matches!(container.rows[0], GridLayoutTrack::Auto));
        assert!(matches!(nodes[1].container_style, ContainerStyle::None));
        assert_eq!(nodes[1].kind, FLEX_LAYOUT_KIND);
        assert_eq!(nodes[1].parent_index, 0);
        let ItemStyle::Grid(item) = &nodes[1].item_style else {
            panic!("expected grid item");
        };
        assert_eq!(item.column, Some(1));
        assert_eq!(item.column_span, Some(2));
        assert_eq!(item.row, Some(0));
        assert_eq!(item.row_span, None);
    }

    #[test]
    fn maps_stack_layout_to_one_overlapping_grid_cell() {
        let scene = build(
            vec![
                object(ARTBOARD, &[(STYLE_ID, 1.0)]),
                object(LAYOUT_COMPONENT_STYLE, &[(LAYOUT_TYPE, 2.0)]),
                object(SHAPE, &[]),
                object(LAYOUT_PARTICIPANT, &[]),
            ],
            vec![-1, 0, 0, 2],
        );

        let imports = create_rive_layout_imports(&scene.graph, &scene.nodes, None);
        let nodes = &imports[0].tree.nodes;

        assert_eq!(nodes[0].kind, GRID_LAYOUT_KIND);
        let ContainerStyle::Grid(container) = &nodes[0].container_style else {
            panic!("expected stack grid");
        };
        assert_eq!(container.columns.len(), 1);
        assert_fraction_track(&container.columns[0], 1.0);
        assert_eq!(container.rows.len(), 1);
        assert_fraction_track(&container.rows[0], 1.0);
        let ItemStyle::Grid(item) = &nodes[1].item_style else {
            panic!("expected stack item");
        };
        assert_eq!(item.column, Some(0));
        assert_eq!(item.row, Some(0));
    }

    #[test]
    fn reports_a_flex_direction_it_does_not_know() {
        let mut diagnostics = Vec::new();
        let scene = flex_root(&[(FLEX_DIRECTION, 9.0)]);

        create_rive_layout_imports(&scene.graph, &scene.nodes, Some(&mut diagnostics));

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.flex-direction-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_diagnostic_number(&diagnostics[0], "directionValue", 9.0);
        assert_diagnostic_string(&diagnostics[0], "substitutedAs", "row");
    }

    #[test]
    fn stays_silent_for_the_flex_direction_the_format_states_as_row() {
        let mut diagnostics = Vec::new();
        let scene = flex_root(&[(FLEX_DIRECTION, 2.0)]);

        let imports =
            create_rive_layout_imports(&scene.graph, &scene.nodes, Some(&mut diagnostics));

        assert!(diagnostics.is_empty());
        let ContainerStyle::Flex(container) = &imports[0].tree.nodes[0].container_style else {
            panic!("expected flex root");
        };
        assert_eq!(container.direction, Some(FlexLayoutDirection::Row));
    }

    #[test]
    fn reports_a_flex_alignment_outside_the_grid_the_format_states() {
        let mut diagnostics = Vec::new();
        let scene = flex_root(&[(FLEX_DIRECTION, 2.0), (LAYOUT_ALIGNMENT, 40.0)]);

        create_rive_layout_imports(&scene.graph, &scene.nodes, Some(&mut diagnostics));

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.flex-alignment-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_diagnostic_number(&diagnostics[0], "alignmentValue", 40.0);
        assert_diagnostic_string(&diagnostics[0], "substitutedAs", "start");
    }

    #[test]
    fn resolves_every_alignment_the_format_states_without_reporting() {
        let mut diagnostics = Vec::new();
        let mut resolved = 0;
        for alignment in 0..=11 {
            let scene = flex_root(&[(FLEX_DIRECTION, 2.0), (LAYOUT_ALIGNMENT, alignment as f32)]);
            let imports =
                create_rive_layout_imports(&scene.graph, &scene.nodes, Some(&mut diagnostics));
            let ContainerStyle::Flex(container) = &imports[0].tree.nodes[0].container_style else {
                panic!("expected flex root");
            };
            if container.align.is_some() {
                resolved += 1;
            }
        }

        assert_eq!(resolved, 12);
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reports_a_grid_track_type_it_does_not_know() {
        let mut diagnostics = Vec::new();
        let scene = build(
            vec![
                object(ARTBOARD, &[(STYLE_ID, 1.0)]),
                object(LAYOUT_COMPONENT_STYLE, &[(LAYOUT_TYPE, 1.0)]),
                object(
                    GRID_TRACK,
                    &[
                        (GRID_TRACK_COLLECTION, 0.0),
                        (GRID_TRACK_TYPE, 7.0),
                        (GRID_TRACK_VALUE, 4.0),
                    ],
                ),
                object(SHAPE, &[]),
            ],
            vec![-1, 0, 0, 0],
        );

        create_rive_layout_imports(&scene.graph, &scene.nodes, Some(&mut diagnostics));

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.grid-track-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_diagnostic_string(&diagnostics[0], "substitutedAs", "auto");
        assert_diagnostic_number(&diagnostics[0], "trackType", 7.0);
        assert_diagnostic_number(&diagnostics[0], "trackValue", 4.0);
    }

    #[test]
    fn stays_silent_for_a_grid_track_the_format_states_as_auto() {
        let mut diagnostics = Vec::new();
        let scene = build(
            vec![
                object(ARTBOARD, &[(STYLE_ID, 1.0)]),
                object(LAYOUT_COMPONENT_STYLE, &[(LAYOUT_TYPE, 1.0)]),
                object(
                    GRID_TRACK,
                    &[(GRID_TRACK_COLLECTION, 0.0), (GRID_TRACK_TYPE, 0.0)],
                ),
                object(SHAPE, &[]),
            ],
            vec![-1, 0, 0, 0],
        );

        let imports =
            create_rive_layout_imports(&scene.graph, &scene.nodes, Some(&mut diagnostics));

        assert!(diagnostics.is_empty());
        let ContainerStyle::Grid(container) = &imports[0].tree.nodes[0].container_style else {
            panic!("expected grid root");
        };
        assert_eq!(container.columns.len(), 1);
        assert!(matches!(container.columns[0], GridLayoutTrack::Auto));
    }

    #[test]
    fn reports_a_layout_component_whose_style_id_cannot_be_resolved() {
        let mut diagnostics = Vec::new();
        let scene = build(vec![object(ARTBOARD, &[(STYLE_ID, 99.0)])], vec![-1]);

        let imports =
            create_rive_layout_imports(&scene.graph, &scene.nodes, Some(&mut diagnostics));

        assert!(imports.is_empty());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.layout-unresolved-style");
        assert_eq!(diagnostics[0].origin, "findRiveLayoutComponents");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_diagnostic_number(&diagnostics[0], "index", 0.0);
        assert_diagnostic_number(&diagnostics[0], "styleId", 99.0);
    }
}

mod import_rive_layout_component {
    use super::*;

    #[test]
    fn imports_a_layout_component_as_a_container_carrying_its_name() {
        let registry = Box::leak(Box::new(create_rive_import_registry()));
        let graph = Box::leak(Box::new(RiveArtboardGraph {
            objects: vec![named_object(LAYOUT_COMPONENT, "layout")],
            parent_indices: vec![-1],
            stream_end: 1,
            stream_start: 0,
        }));
        let root: Node2DRef = create_display_object(None);
        let mut context =
            create_rive_artboard_import_context(registry, graph, &graph.objects, root, &[], None);

        let node = import_rive_layout_component(&mut context, 0).unwrap();

        assert_eq!(
            node.read().unwrap().node_fields().name.as_deref(),
            Some("layout")
        );
    }
}

mod register_rive_layout_handlers {
    use super::*;

    #[test]
    fn claims_the_layout_component_and_the_styles_that_describe_it() {
        let mut registry = create_rive_import_registry();

        register_rive_layout_handlers(&mut registry);

        assert!(get_rive_core_object_handler(&registry, LAYOUT_COMPONENT as i32).is_some());
        assert!(get_rive_core_object_handler(&registry, LAYOUT_COMPONENT_STYLE as i32).is_some(),);
        assert!(get_rive_core_object_handler(&registry, GRID_TRACK as i32).is_some());
        assert!(get_rive_core_object_handler(&registry, GRID_ITEM_PLACEMENT as i32).is_some());
    }

    #[test]
    fn registers_the_descriptors_as_a_pass_so_every_target_exists_before_a_tree_is_built() {
        let mut registry = create_rive_import_registry();
        register_rive_layout_handlers(&mut registry);

        let handler = get_rive_core_object_handler(&registry, LAYOUT_COMPONENT as i32).unwrap();

        assert!(handler.apply_artboard.is_some());
    }
}

fn assert_diagnostic_number(diagnostic: &ImportDiagnostic, key: &str, expected: f32) {
    let Some(ImportDiagnosticDetailValue::Number(actual)) = diagnostic
        .detail
        .as_ref()
        .and_then(|detail| detail.get(key))
    else {
        panic!("expected diagnostic number {key}");
    };
    assert_f32(*actual, expected);
}

fn assert_diagnostic_string(diagnostic: &ImportDiagnostic, key: &str, expected: &str) {
    let Some(ImportDiagnosticDetailValue::String(actual)) = diagnostic
        .detail
        .as_ref()
        .and_then(|detail| detail.get(key))
    else {
        panic!("expected diagnostic string {key}");
    };
    assert_eq!(actual, expected);
}

fn assert_f32(actual: f32, expected: f32) {
    // D1 f32 bound (TS: 0)
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!((actual - expected).abs() <= bound);
}

fn assert_fixed_track(track: &GridLayoutTrack, expected: f32) {
    let GridLayoutTrack::Fixed { size } = track else {
        panic!("expected fixed track");
    };
    assert_f32(*size, expected);
}

fn assert_flex_basis(basis: Option<FlexBasis>, expected: f32) {
    let Some(FlexBasis::Fixed(actual)) = basis else {
        panic!("expected fixed flex basis");
    };
    assert_f32(actual, expected);
}

fn assert_fraction_track(track: &GridLayoutTrack, expected: f32) {
    let GridLayoutTrack::Fraction { fraction } = track else {
        panic!("expected fractional track");
    };
    assert_f32(*fraction, expected);
}

fn assert_target(actual: &Node2DRef, expected: &Option<Node2DRef>) {
    assert!(Arc::ptr_eq(actual, expected.as_ref().unwrap()));
}

fn build(objects: Vec<RiveCoreObject>, parent_indices: Vec<i32>) -> TestScene {
    let nodes = objects
        .iter()
        .map(|source| {
            matches!(source.type_key, ARTBOARD | SHAPE | LAYOUT_COMPONENT)
                .then(|| -> Node2DRef { create_display_object(None) })
        })
        .collect();
    return TestScene {
        graph: RiveArtboardGraph {
            stream_end: objects.len(),
            stream_start: 0,
            objects,
            parent_indices,
        },
        nodes,
    };
}

fn flex_root(style: &[(u64, f32)]) -> TestScene {
    return build(
        vec![
            object(ARTBOARD, &[(STYLE_ID, 1.0)]),
            object(LAYOUT_COMPONENT_STYLE, style),
            object(SHAPE, &[]),
        ],
        vec![-1, 0, 0],
    );
}

fn named_object(type_key: u64, name: &str) -> RiveCoreObject {
    return RiveCoreObject {
        properties: vec![RiveProperty {
            key: NAME,
            r#type: RiveFieldType::String,
            value: RiveValue::String(name.to_string()),
        }],
        type_key,
    };
}

fn object(type_key: u64, properties: &[(u64, f32)]) -> RiveCoreObject {
    return RiveCoreObject {
        properties: properties
            .iter()
            .map(|(key, value)| RiveProperty {
                key: *key,
                r#type: RiveFieldType::Double,
                value: RiveValue::Double(*value),
            })
            .collect(),
        type_key,
    };
}
