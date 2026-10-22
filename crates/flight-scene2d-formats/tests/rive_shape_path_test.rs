use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_math::CIRCLE_KAPPA;
use flight_path::{Path, PathCommand};
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;

const ARTBOARD: u64 = 1;
const POINTS_PATH: u64 = 16;
const RECTANGLE: u64 = 7;
const ELLIPSE: u64 = 4;
const TRIANGLE: u64 = 8;
const POLYGON: u64 = 51;
const STAR: u64 = 52;
const SHAPE: u64 = 3;
const STRAIGHT_VERTEX: u64 = 5;
const CUBIC_DETACHED_VERTEX: u64 = 6;
const CUBIC_MIRRORED_VERTEX: u64 = 35;
const CUBIC_ASYMMETRIC_VERTEX: u64 = 34;
const PARAMETRIC_PATH: u64 = 15;

mod create_rive_path {
    use super::*;

    #[test]
    fn returns_none_for_a_component_that_is_not_a_path() {
        assert!(
            create_rive_path(
                &object(SHAPE, &[]),
                &artboard_of(vec![object(SHAPE, &[])]),
                0,
                None,
            )
            .is_none(),
        );
    }

    #[test]
    fn reports_a_path_kind_it_does_not_build_which_an_empty_result_cannot_be_told_apart_from() {
        let mut diagnostics = Vec::new();
        assert!(
            create_rive_path(
                &object(SHAPE, &[]),
                &artboard_of(vec![object(SHAPE, &[])]),
                0,
                Some(&mut diagnostics),
            )
            .is_none(),
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.path-kind-unsupported");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("typeKey"),
            Some(&ImportDiagnosticDetailValue::Number(SHAPE as f32)),
        );
    }

    #[test]
    fn reports_an_unrecognised_parametric_kind_which_is_drawn_as_a_rectangle_rather_than_dropped() {
        let source = object(PARAMETRIC_PATH, &[(20, 10.0), (21, 10.0)]);
        let mut diagnostics = Vec::new();
        let path = create_rive_path(
            &source,
            &artboard_of(vec![source.clone()]),
            0,
            Some(&mut diagnostics),
        )
        .unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.parametric-path-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("substitutedAs"),
            Some(&ImportDiagnosticDetailValue::String(
                "rectangle".to_string()
            )),
        );
        assert_eq!(
            path.commands,
            [
                PathCommand::MoveTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::Close as u8,
            ],
        );
    }

    #[test]
    fn builds_an_open_polyline_from_straight_vertices() {
        let path = points_path(
            false,
            vec![
                object(STRAIGHT_VERTEX, &[(24, 0.0), (25, 0.0)]),
                object(STRAIGHT_VERTEX, &[(24, 10.0), (25, 0.0)]),
                object(STRAIGHT_VERTEX, &[(24, 10.0), (25, 5.0)]),
            ],
        );
        assert_eq!(
            path.commands,
            [
                PathCommand::MoveTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::LineTo as u8,
            ],
        );
        assert_eq!(path.data, [0.0, 0.0, 10.0, 0.0, 10.0, 5.0]);
    }

    #[test]
    fn closes_the_contour_back_to_the_first_vertex_when_the_path_says_it_is_closed() {
        let vertices = vec![
            object(STRAIGHT_VERTEX, &[(24, 0.0), (25, 0.0)]),
            object(STRAIGHT_VERTEX, &[(24, 10.0), (25, 0.0)]),
        ];
        let open = points_path(false, vertices.clone());
        let closed = points_path(true, vertices);
        assert_eq!(
            open.commands,
            [PathCommand::MoveTo as u8, PathCommand::LineTo as u8],
        );
        assert_eq!(
            closed.commands,
            [
                PathCommand::MoveTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::Close as u8,
            ],
        );
    }

    #[test]
    fn places_a_mirrored_vertex_handle_opposite_its_outgoing_one_at_the_same_distance() {
        let rotation = 0.7_f32;
        let distance = 4.0_f32;
        let path = points_path(
            false,
            vec![
                object(
                    CUBIC_MIRRORED_VERTEX,
                    &[(24, 0.0), (25, 0.0), (82, rotation), (83, distance)],
                ),
                object(
                    CUBIC_MIRRORED_VERTEX,
                    &[(24, 20.0), (25, 0.0), (82, rotation), (83, distance)],
                ),
            ],
        );
        assert_eq!(
            path.commands,
            [PathCommand::MoveTo as u8, PathCommand::CubicCurveTo as u8],
        );
        assert_points(
            &path.data[2..6],
            &[
                f64::from(rotation.cos() * distance),
                f64::from(rotation.sin() * distance),
                f64::from(20.0 - rotation.cos() * distance),
                f64::from(-rotation.sin() * distance),
            ],
        );
    }

    #[test]
    fn gives_an_asymmetric_vertex_one_angle_and_two_lengths() {
        let rotation = 1.2_f32;
        let path = points_path(
            false,
            vec![
                object(
                    CUBIC_ASYMMETRIC_VERTEX,
                    &[(24, 0.0), (25, 0.0), (79, rotation), (80, 3.0), (81, 9.0)],
                ),
                object(
                    CUBIC_ASYMMETRIC_VERTEX,
                    &[(24, 30.0), (25, 0.0), (79, rotation), (80, 3.0), (81, 9.0)],
                ),
            ],
        );
        assert_points(
            &path.data[2..6],
            &[
                f64::from(rotation.cos() * 9.0),
                f64::from(rotation.sin() * 9.0),
                f64::from(30.0 - rotation.cos() * 3.0),
                f64::from(-rotation.sin() * 3.0),
            ],
        );
    }

    #[test]
    fn adds_a_detached_vertex_handle_rather_than_subtracting_it() {
        let in_rotation = 2.5_f32;
        let out_rotation = 0.4_f32;
        let properties = |x| {
            vec![
                (24, x),
                (25, 0.0),
                (84, in_rotation),
                (85, 2.0),
                (86, out_rotation),
                (87, 6.0),
            ]
        };
        let path = points_path(
            false,
            vec![
                object(CUBIC_DETACHED_VERTEX, &properties(0.0)),
                object(CUBIC_DETACHED_VERTEX, &properties(40.0)),
            ],
        );
        assert_points(
            &path.data[2..6],
            &[
                f64::from(out_rotation.cos() * 6.0),
                f64::from(out_rotation.sin() * 6.0),
                f64::from(40.0 + in_rotation.cos() * 2.0),
                f64::from(in_rotation.sin() * 2.0),
            ],
        );
    }

    #[test]
    fn keeps_a_segment_straight_only_when_neither_end_states_a_handle() {
        let path = points_path(
            false,
            vec![
                object(STRAIGHT_VERTEX, &[(24, 0.0), (25, 0.0)]),
                object(
                    CUBIC_MIRRORED_VERTEX,
                    &[(24, 10.0), (25, 0.0), (82, 0.0), (83, 3.0)],
                ),
                object(STRAIGHT_VERTEX, &[(24, 20.0), (25, 0.0)]),
            ],
        );
        assert_eq!(
            path.commands,
            [
                PathCommand::MoveTo as u8,
                PathCommand::CubicCurveTo as u8,
                PathCommand::CubicCurveTo as u8,
            ],
        );
    }

    #[test]
    fn centres_a_parametric_path_on_its_normalized_origin() {
        let centered = path_of(RECTANGLE, &[(20, 100.0), (21, 50.0)]);
        let cornered = path_of(
            RECTANGLE,
            &[(20, 100.0), (21, 50.0), (123, 0.0), (124, 0.0)],
        );
        assert_points(&centered.data[..2], &[-50.0, -25.0]);
        assert_points(&cornered.data[..2], &[0.0, 0.0]);
    }

    #[test]
    fn rounds_every_rectangle_corner_when_the_radii_are_linked() {
        let square = path_of(RECTANGLE, &[(20, 100.0), (21, 100.0)]);
        let rounded = path_of(RECTANGLE, &[(20, 100.0), (21, 100.0), (31, 10.0)]);
        assert_eq!(square.commands.len(), 5);
        assert_eq!(
            rounded
                .commands
                .iter()
                .filter(|command| **command == PathCommand::CubicCurveTo as u8)
                .count(),
            4,
        );
        assert_eq!(rounded.commands.len(), 10);
    }

    #[test]
    fn honours_four_distinct_corner_radii_when_they_are_unlinked() {
        let path = path_of(
            RECTANGLE,
            &[
                (20, 100.0),
                (21, 100.0),
                (31, 10.0),
                (161, 0.0),
                (162, 20.0),
                (163, 0.0),
                (164, 0.0),
            ],
        );
        assert_eq!(
            path.commands
                .iter()
                .filter(|command| **command == PathCommand::CubicCurveTo as u8)
                .count(),
            2,
        );
    }

    #[test]
    fn builds_ellipse_triangle_polygon_and_star_geometry() {
        let ellipse = path_of(ELLIPSE, &[(20, 40.0), (21, 20.0)]);
        let triangle = path_of(TRIANGLE, &[(20, 40.0), (21, 20.0)]);
        let polygon = path_of(POLYGON, &[(20, 40.0), (21, 40.0), (125, 6.0)]);
        let star = path_of(STAR, &[(20, 40.0), (21, 40.0), (125, 5.0), (127, 0.5)]);
        assert_eq!(ellipse.commands.len(), 6);
        assert_eq!(triangle.data, [0.0, -10.0, 20.0, 10.0, -20.0, 10.0]);
        assert_eq!(polygon.data.len(), 12);
        assert_eq!(star.data.len(), 20);
    }

    #[test]
    fn puts_a_star_inner_vertex_at_its_stated_fraction_of_the_radius() {
        let star = path_of(STAR, &[(20, 100.0), (21, 100.0), (125, 4.0), (127, 0.25)]);
        let radii = star
            .data
            .chunks_exact(2)
            .map(|point| point[0].hypot(point[1]))
            .collect::<Vec<_>>();
        assert_f64_close_4(
            radii.iter().copied().fold(f64::NEG_INFINITY, f64::max),
            50.0,
        );
        assert_f64_close_4(radii.iter().copied().fold(f64::INFINITY, f64::min), 12.5);
    }

    #[test]
    fn returns_an_empty_path_for_a_points_path_with_no_vertices() {
        assert!(points_path(true, Vec::new()).commands.is_empty());
    }

    #[test]
    fn pulls_a_rounded_corner_back_along_both_edges_by_its_radius() {
        let path = rounded_triangle(10.0, true);
        let points = point_pairs(&path);
        assert!(points.contains(&[90.0, 0.0]));
        assert!(points.contains(&[100.0, 10.0]));
        assert!(!points.contains(&[100.0, 0.0]));
    }

    #[test]
    fn collapses_to_the_circle_ratio_at_a_right_angle() {
        let path = rounded_triangle(10.0, true);
        let cubic = cubic_after(&path, [90.0, 0.0]).unwrap();
        assert_f64_close_4(cubic[0], 90.0 + 10.0 * f64::from(CIRCLE_KAPPA));
        assert_f64_close_6(cubic[1], 0.0);
    }

    #[test]
    fn clamps_a_radius_larger_than_the_edges_can_carry() {
        let path = points_path(
            true,
            vec![
                object(STRAIGHT_VERTEX, &[(24, 0.0), (25, 0.0)]),
                object(STRAIGHT_VERTEX, &[(24, 20.0), (25, 0.0), (26, 1000.0)]),
                object(STRAIGHT_VERTEX, &[(24, 20.0), (25, 20.0)]),
            ],
        );
        let points = point_pairs(&path);
        assert!(points.contains(&[10.0, 0.0]));
        assert!(points.contains(&[20.0, 10.0]));
    }

    #[test]
    fn turns_a_negative_radius_into_an_inverted_corner() {
        let path = rounded_triangle(-10.0, true);
        let points = point_pairs(&path);
        let cubic = cubic_after(&path, [90.0, 0.0]).unwrap();
        assert!(points.contains(&[90.0, 0.0]));
        assert!(points.contains(&[100.0, 10.0]));
        assert_f64_close_6(cubic[0], 90.0);
        assert_f64_close_4(cubic[1], 10.0 * f64::from(CIRCLE_KAPPA));
        assert_f64_close_4(cubic[2], 100.0 - 10.0 * f64::from(CIRCLE_KAPPA));
        assert_f64_close_6(cubic[3], 10.0);
    }

    #[test]
    fn leaves_an_open_paths_endpoints_sharp_since_a_corner_needs_two_edges() {
        let path = points_path(
            false,
            vec![
                object(STRAIGHT_VERTEX, &[(24, 0.0), (25, 0.0), (26, 5.0)]),
                object(STRAIGHT_VERTEX, &[(24, 100.0), (25, 0.0), (26, 5.0)]),
                object(STRAIGHT_VERTEX, &[(24, 100.0), (25, 100.0), (26, 5.0)]),
            ],
        );
        let points = point_pairs(&path);
        assert_eq!(points[0], [0.0, 0.0]);
        assert!(points.contains(&[100.0, 100.0]));
        assert_eq!(
            path.commands
                .iter()
                .filter(|command| **command == PathCommand::CubicCurveTo as u8)
                .count(),
            1,
        );
    }

    #[test]
    fn leaves_a_zero_radius_sharp() {
        let path = rounded_triangle(0.0, true);
        assert_eq!(
            path.commands,
            [
                PathCommand::MoveTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::Close as u8,
            ],
        );
    }
}

mod create_rive_path_record {
    use super::*;

    #[test]
    fn bakes_the_path_own_transform_into_the_geometry_it_hands_the_shape() {
        let graph = artboard_of(vec![object(
            RECTANGLE,
            &[(13, 100.0), (14, 50.0), (20, 10.0), (21, 10.0)],
        )]);
        let record = create_rive_path_record(&graph, 0, None).unwrap();
        assert_eq!(record.path_index, 0);
        assert!(
            record
                .data
                .iter()
                .step_by(2)
                .copied()
                .fold(f32::INFINITY, f32::min)
                > 50.0,
        );
    }

    #[test]
    fn returns_none_for_a_path_that_states_no_geometry() {
        assert!(
            create_rive_path_record(&artboard_of(vec![object(POINTS_PATH, &[])]), 0, None)
                .is_none(),
        );
    }
}

mod import_rive_path_component {
    use super::*;

    #[test]
    fn files_geometry_under_the_shape_that_owns_it_and_contributes_no_node() {
        let objects = vec![
            object(ARTBOARD, &[]),
            object(SHAPE, &[]),
            object(RECTANGLE, &[(20, 10.0), (21, 10.0)]),
        ];
        let mut context = context_of(objects, vec![-1, 0, 1], None);
        assert!(import_rive_path_component(&mut context, 2).is_none());
        assert_eq!(context.shape_paths.get(&1).unwrap().len(), 1);
    }

    #[test]
    fn reports_a_path_with_no_shape_above_it_because_the_geometry_leaves_no_other_trace() {
        let diagnostics = Box::leak(Box::new(Vec::new()));
        let objects = vec![
            object(ARTBOARD, &[]),
            object(RECTANGLE, &[(20, 10.0), (21, 10.0)]),
        ];
        let mut context = context_of(objects, vec![-1, 0], Some(diagnostics));
        assert!(import_rive_path_component(&mut context, 1).is_none());
        assert_eq!(
            context.diagnostics.as_ref().unwrap()[0].kind,
            "rive.path-outside-shape",
        );
    }
}

mod register_rive_path_handlers {
    use super::*;

    #[test]
    fn claims_every_path_kind_through_the_base_type_they_inherit_from() {
        let mut registry = create_rive_import_registry();
        register_rive_path_handlers(&mut registry);
        assert!(get_rive_core_object_handler(&registry, RECTANGLE as i32).is_some());
        assert!(get_rive_core_object_handler(&registry, POINTS_PATH as i32).is_some());
    }

    #[test]
    fn claims_the_vertices_a_path_is_built_from_so_they_are_not_reported_as_unread_types() {
        let mut registry = create_rive_import_registry();
        register_rive_path_handlers(&mut registry);
        let handler = get_rive_core_object_handler(&registry, STRAIGHT_VERTEX as i32).unwrap();
        let mut context = context_of(Vec::new(), Vec::new(), None);
        assert!(handler.import_component.as_ref().unwrap()(&mut context, 0).is_none());
    }
}

fn artboard_of(objects: Vec<RiveCoreObject>) -> RiveArtboardGraph {
    return RiveArtboardGraph {
        parent_indices: objects.iter().map(|_| -1).collect(),
        stream_end: objects.len(),
        stream_start: 0,
        objects,
    };
}

fn assert_f64_close_4(actual: f64, expected: f64) {
    // D1 f32 bound (TS: 0.00005)
    let bound = 0.00005_f64.max(4.0 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound);
}

fn assert_f64_close_6(actual: f64, expected: f64) {
    // D1 f32 bound (TS: 0.0000005)
    let bound = 0.0000005_f64.max(4.0 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound);
}

fn assert_points(actual: &[f64], expected: &[f64]) {
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter().zip(expected) {
        assert_f64_close_6(*actual, *expected);
    }
}

fn context_of(
    objects: Vec<RiveCoreObject>,
    parent_indices: Vec<i32>,
    diagnostics: Option<&'static mut Vec<ImportDiagnostic>>,
) -> RiveArtboardImportContext<'static> {
    let graph = Box::leak(Box::new(RiveArtboardGraph {
        stream_end: objects.len(),
        stream_start: 0,
        objects,
        parent_indices,
    }));
    let registry = Box::leak(Box::new(create_rive_import_registry()));
    let root: Node2DRef = create_display_object();
    return create_rive_artboard_import_context(
        registry,
        graph,
        &graph.objects,
        root,
        &[],
        diagnostics,
    );
}

fn cubic_after(path: &Path, from: [f64; 2]) -> Option<[f64; 4]> {
    let mut cursor = 0;
    let mut current = [0.0, 0.0];
    for command in &path.commands {
        if *command == PathCommand::MoveTo as u8 || *command == PathCommand::LineTo as u8 {
            current = [path.data[cursor], path.data[cursor + 1]];
            cursor += 2;
        } else if *command == PathCommand::CubicCurveTo as u8 {
            if current == from {
                return Some([
                    path.data[cursor],
                    path.data[cursor + 1],
                    path.data[cursor + 2],
                    path.data[cursor + 3],
                ]);
            }
            current = [path.data[cursor + 4], path.data[cursor + 5]];
            cursor += 6;
        }
    }
    return None;
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

fn path_of(type_key: u64, properties: &[(u64, f32)]) -> Path {
    let source = object(type_key, properties);
    return create_rive_path(&source, &artboard_of(Vec::new()), 0, None).unwrap();
}

fn point_pairs(path: &Path) -> Vec<[f64; 2]> {
    let mut points = Vec::new();
    let mut cursor = 0;
    for command in &path.commands {
        if *command == PathCommand::MoveTo as u8 || *command == PathCommand::LineTo as u8 {
            points.push([path.data[cursor], path.data[cursor + 1]]);
            cursor += 2;
        } else if *command == PathCommand::CubicCurveTo as u8 {
            points.push([path.data[cursor + 4], path.data[cursor + 5]]);
            cursor += 6;
        }
    }
    return points;
}

fn points_path(closed: bool, vertices: Vec<RiveCoreObject>) -> Path {
    let path = object(POINTS_PATH, if closed { &[(32, 1.0)] } else { &[] });
    let mut objects = vec![path.clone()];
    objects.extend(vertices);
    let graph = RiveArtboardGraph {
        parent_indices: (0..objects.len())
            .map(|index| if index == 0 { -1 } else { 0 })
            .collect(),
        stream_end: objects.len(),
        stream_start: 0,
        objects,
    };
    return create_rive_path(&path, &graph, 0, None).unwrap();
}

fn rounded_triangle(radius: f32, closed: bool) -> Path {
    return points_path(
        closed,
        vec![
            object(STRAIGHT_VERTEX, &[(24, 0.0), (25, 0.0)]),
            object(STRAIGHT_VERTEX, &[(24, 100.0), (25, 0.0), (26, radius)]),
            object(STRAIGHT_VERTEX, &[(24, 100.0), (25, 100.0)]),
        ],
    );
}
