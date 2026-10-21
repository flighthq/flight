use flight_clip::{ClipRegion, clip_region_contains_point, create_clip_region_state};
use flight_entity::{FlightError, Ref};
use flight_importdiagnostics::{ImportDiagnostic, ImportDiagnosticSeverity};
use flight_path::{PathCommand, PathWinding};
use flight_path_boolean::MARTINEZ_PATH_BOOLEAN_KERNEL;
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;

const ARTBOARD: u64 = 1;
const NODE: u64 = 2;
const SHAPE: u64 = 3;
const FILL: u64 = 20;
const CLIPPING_SHAPE: u64 = 42;
const X: u64 = 13;
const ROTATION: u64 = 15;
const SOURCE_ID: u64 = 92;
const FILL_RULE: u64 = 93;
const IS_VISIBLE: u64 = 94;

mod apply_rive_clipping {
    use super::*;

    #[test]
    fn moves_the_clip_from_the_source_chain_into_the_clipped_node_chain() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[(X, 30.0)]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 3.0)]),
            object(SHAPE, &[(X, 100.0)]),
        ]);
        scene.parents = vec![-1, 0, 1, 0];
        let clip = run(&scene, &[(3, vec![square()])], None, 1).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(clip.contours.as_ref().unwrap()[0][0..2], [70.0, 0.0]);
    }

    #[test]
    fn accounts_for_rotation_in_either_chain_not_only_translation() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[(ROTATION, std::f32::consts::PI / 2.0)]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 3.0)]),
            object(SHAPE, &[(X, 10.0)]),
        ]);
        scene.parents = vec![-1, 0, 1, 0];
        let clip = run(&scene, &[(3, vec![square()])], None, 1).unwrap();
        let clip = clip.read().unwrap();
        let contour = &clip.contours.as_ref().unwrap()[0];
        assert!(contour[0].abs() < 0.5e-6);
        assert!((contour[1] + 10.0).abs() < 0.5e-6);
    }

    #[test]
    fn inherits_the_transform_of_an_ancestor_that_carries_one() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(NODE, &[(X, 5.0)]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 4.0)]),
            object(SHAPE, &[(X, 100.0)]),
        ]);
        scene.parents = vec![-1, 0, 1, 2, 0];
        let clip = run(&scene, &[(4, vec![square()])], None, 2).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(clip.contours.as_ref().unwrap()[0][0..2], [95.0, 0.0]);
    }

    #[test]
    fn inherits_a_transform_from_a_parent_that_follows_it_in_the_component_stream() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[(X, 5.0)]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 4.0)]),
            object(NODE, &[(X, 40.0)]),
            object(SHAPE, &[(X, 100.0)]),
        ]);
        scene.parents = vec![-1, 3, 1, 0, 0];
        let clip = run(&scene, &[(4, vec![square()])], None, 1).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(clip.contours.as_ref().unwrap()[0][0..2], [55.0, 0.0]);
    }

    #[test]
    fn passes_an_ancestor_transform_through_a_component_that_holds_none() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(NODE, &[(X, 40.0)]),
            object(FILL, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 5.0)]),
            object(SHAPE, &[(X, 100.0)]),
        ]);
        scene.parents = vec![-1, 0, 1, 2, 3, 0];
        let clip = run(&scene, &[(5, vec![square()])], None, 3).unwrap();
        let clip = clip.read().unwrap();
        assert_eq!(clip.contours.as_ref().unwrap()[0][0..2], [60.0, 0.0]);
    }

    #[test]
    fn applies_the_fill_rule_the_clipping_shape_states() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 3.0), (FILL_RULE, 1.0)]),
            object(SHAPE, &[]),
        ]);
        scene.parents = vec![-1, 0, 1, 0];
        let clip = run(
            &scene,
            &[(
                3,
                vec![
                    rectangle(0.0, 0.0, 10.0, 10.0),
                    rectangle(0.0, 0.0, 10.0, 10.0),
                ],
            )],
            None,
            1,
        )
        .unwrap();
        assert_eq!(clip.read().unwrap().winding, PathWinding::NonZero);
        let state = create_clip_region_state();
        assert!(!clip_region_contains_point(&state, &clip, 5.0, 5.0));
    }

    #[test]
    fn ignores_a_clipping_shape_the_file_marks_invisible() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 3.0), (IS_VISIBLE, 0.0)]),
            object(SHAPE, &[]),
        ]);
        scene.parents = vec![-1, 0, 1, 0];
        assert!(run(&scene, &[(3, vec![square()])], None, 1).is_none());
    }

    #[test]
    fn crumbs_a_clipping_shape_whose_source_has_no_geometry() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 99.0)]),
        ]);
        scene.parents = vec![-1, 0, 1];
        let mut diagnostics = Vec::new();
        run(&scene, &[], Some(&mut diagnostics), 1);
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.unresolved-clipping-source"]
        );
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
    }

    #[test]
    fn throws_for_a_parent_cycle_instead_of_substituting_the_root_transform() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 3.0)]),
            object(SHAPE, &[]),
        ]);
        scene.parents = vec![-1, 3, 1, 1];
        let error = flight_error(|| {
            run(&scene, &[(3, vec![square()])], None, 1);
        });
        assert!(error.message.contains("Rive component parent cycle"));
    }

    #[test]
    fn throws_for_an_unresolved_transform_parent_instead_of_substituting_the_root_transform() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 3.0)]),
            object(SHAPE, &[]),
        ]);
        scene.parents = vec![-1, 99, 1, 0];
        let error = flight_error(|| {
            run(&scene, &[(3, vec![square()])], None, 1);
        });
        assert!(
            error
                .message
                .contains("Rive component 1 has unresolved parent 99")
        );
    }

    #[test]
    fn intersects_several_clipping_shapes_on_one_node() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 4.0)]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 5.0)]),
            object(SHAPE, &[]),
            object(SHAPE, &[]),
        ]);
        scene.parents = vec![-1, 0, 1, 1, 0, 0];
        let mut diagnostics = Vec::new();
        let clip = run(
            &scene,
            &[
                (4, vec![rectangle(0.0, 0.0, 10.0, 10.0)]),
                (5, vec![rectangle(5.0, 0.0, 10.0, 10.0)]),
            ],
            Some(&mut diagnostics),
            1,
        )
        .unwrap();
        let state = create_clip_region_state();
        assert!(clip_region_contains_point(&state, &clip, 7.0, 5.0));
        assert!(!clip_region_contains_point(&state, &clip, 2.0, 5.0));
        assert!(!clip_region_contains_point(&state, &clip, 12.0, 5.0));
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn intersects_the_complete_contour_set_rather_than_one_contour_from_each_shape() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 4.0)]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 5.0)]),
            object(SHAPE, &[]),
            object(SHAPE, &[]),
        ]);
        scene.parents = vec![-1, 0, 1, 1, 0, 0];
        let clip = run(
            &scene,
            &[
                (
                    4,
                    vec![
                        rectangle(0.0, 0.0, 10.0, 10.0),
                        rectangle(20.0, 0.0, 10.0, 10.0),
                    ],
                ),
                (5, vec![rectangle(5.0, -5.0, 20.0, 20.0)]),
            ],
            None,
            1,
        )
        .unwrap();
        assert_eq!(clip.read().unwrap().contours.as_ref().unwrap().len(), 2);
        let state = create_clip_region_state();
        assert!(clip_region_contains_point(&state, &clip, 7.0, 5.0));
        assert!(clip_region_contains_point(&state, &clip, 22.0, 5.0));
        assert!(!clip_region_contains_point(&state, &clip, 15.0, 5.0));
    }

    #[test]
    fn resolves_each_clipping_shape_under_its_own_fill_rule_before_intersecting() {
        let mut scene = build(vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 4.0), (FILL_RULE, 1.0)]),
            object(CLIPPING_SHAPE, &[(SOURCE_ID, 5.0)]),
            object(SHAPE, &[]),
            object(SHAPE, &[]),
        ]);
        scene.parents = vec![-1, 0, 1, 1, 0, 0];
        let duplicate = rectangle(0.0, 0.0, 10.0, 10.0);
        let clip = run(
            &scene,
            &[
                (4, vec![duplicate, rectangle(0.0, 0.0, 10.0, 10.0)]),
                (5, vec![rectangle(0.0, 0.0, 10.0, 10.0)]),
            ],
            None,
            1,
        )
        .unwrap();
        let state = create_clip_region_state();
        assert!(!clip_region_contains_point(&state, &clip, 5.0, 5.0));
    }
}

mod register_rive_clipping_handlers {
    use super::*;

    #[test]
    fn claims_the_clipping_shape_and_gives_it_no_node_of_its_own() {
        let mut registry = create_rive_import_registry();
        register_rive_clipping_handlers(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        let handler = get_rive_core_object_handler(&registry, CLIPPING_SHAPE as i32).unwrap();
        assert!(handler.apply_artboard.is_some());
        assert!(handler.import_component.is_some());
        let artboard = graph(vec![object(CLIPPING_SHAPE, &[])], vec![-1]);
        let root: Node2DRef = create_display_object(None);
        let mut context = create_rive_artboard_import_context(
            &registry,
            &artboard,
            &artboard.objects,
            root,
            &[],
            None,
        );
        assert!((handler.import_component.as_ref().unwrap())(&mut context, 0).is_none());
    }

    #[test]
    fn registers_clipping_as_a_pass_because_a_clip_source_can_be_read_after_the_node_it_clips() {
        let mut registry = create_rive_import_registry();
        register_rive_clipping_handlers(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        assert!(
            get_rive_core_object_handler(&registry, CLIPPING_SHAPE as i32)
                .unwrap()
                .apply_artboard
                .is_some()
        );
    }
}

struct TestScene {
    objects: Vec<RiveCoreObject>,
    parents: Vec<i32>,
}

fn run(
    scene: &TestScene,
    paths: &[(usize, Vec<RivePathRecord>)],
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    clipped: usize,
) -> Option<Ref<ClipRegion>> {
    let artboard = graph(scene.objects.clone(), scene.parents.clone());
    let nodes = scene
        .objects
        .iter()
        .enumerate()
        .map(|(index, object)| {
            if index == 0 || object.type_key == SHAPE || object.type_key == NODE {
                Some(create_display_object(None) as Node2DRef)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    let shape_paths = paths.iter().cloned().collect();
    apply_rive_clipping(
        &MARTINEZ_PATH_BOOLEAN_KERNEL,
        &nodes,
        &artboard,
        &shape_paths,
        diagnostics,
    );
    let node = nodes.get(clipped)?.as_ref()?;
    let clip = node.read().unwrap().node2d_fields().clip.clone();
    return clip;
}

fn build(objects: Vec<RiveCoreObject>) -> TestScene {
    let parents = objects
        .iter()
        .enumerate()
        .map(|(index, _)| if index == 0 { -1 } else { 0 })
        .collect();
    return TestScene { objects, parents };
}

fn graph(objects: Vec<RiveCoreObject>, parent_indices: Vec<i32>) -> RiveArtboardGraph {
    let stream_end = objects.len();
    return RiveArtboardGraph {
        objects,
        parent_indices,
        stream_end,
        stream_start: 0,
    };
}

fn square() -> RivePathRecord {
    return RivePathRecord {
        commands: vec![
            PathCommand::MoveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
        ],
        data: vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0],
        path_index: 0,
        winding: PathWinding::NonZero,
    };
}

fn rectangle(x: f32, y: f32, width: f32, height: f32) -> RivePathRecord {
    return RivePathRecord {
        commands: vec![
            PathCommand::MoveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::Close as u8,
        ],
        data: vec![x, y, x + width, y, x + width, y + height, x, y + height],
        path_index: 0,
        winding: PathWinding::NonZero,
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

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn flight_error(run: impl FnOnce()) -> FlightError {
    let payload = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run))
        .expect_err("operation should throw");
    return match payload.downcast::<FlightError>() {
        Ok(error) => *error,
        Err(_) => panic!("panic payload must be a FlightError"),
    };
}
