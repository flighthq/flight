// flight-lint: allow-file(f64) Shape command tokens and canonical path-length measurements use the approved D1 f64 lane

use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_path::{Path, PathCommand, PathWinding, create_path, get_path_length};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{Shape, ShapeCommandToken, create_shape};

const SHAPE: u64 = 3;
const RADIAL_GRADIENT: u64 = 17;
const SOLID_COLOR: u64 = 18;
const GRADIENT_STOP: u64 = 19;
const FILL: u64 = 20;
const LINEAR_GRADIENT: u64 = 22;
const STROKE: u64 = 24;
const TRIM_PATH: u64 = 47;
const DASH_PATH: u64 = 506;
const DASH: u64 = 507;

mod append_rive_shape_geometry {
    use super::*;

    #[test]
    fn draws_the_paths_with_no_paint_around_them() {
        let shape = create_shape();
        append_rive_shape_geometry(&shape, &[square_path()]);
        assert!(paint_tokens(&shape).is_empty());
        assert_eq!(draw_count(&shape), 1);
    }

    #[test]
    fn keeps_each_path_own_winding_so_a_hole_stays_a_hole() {
        let shape = create_shape();
        let mut hole = square_path();
        hole.winding = PathWinding::EvenOdd;
        append_rive_shape_geometry(&shape, &[hole]);
        assert_eq!(winding_of(&shape), "evenOdd");
    }

    #[test]
    fn draws_nothing_for_an_empty_path_list() {
        let shape = create_shape();
        append_rive_shape_geometry(&shape, &[]);
        assert!(shape_commands(&shape).is_empty());
    }
}

mod append_rive_shape_paint {
    use super::*;

    #[test]
    fn draws_nothing_when_the_shape_has_no_paths() {
        let shape = create_shape();
        append_rive_shape_paint(&shape, &graph(vec![object(SHAPE, &[])], None), 0, &[], None);
        assert!(shape_commands(&shape).is_empty());
    }

    #[test]
    fn emits_the_geometry_even_when_the_shape_states_no_paint() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(vec![object(SHAPE, &[])], None),
            0,
            &[square()],
            None,
        );
        assert!(paint_tokens(&shape).is_empty());
        assert_eq!(draw_count(&shape), 1);
    }

    #[test]
    fn unpacks_a_solid_colour_from_the_argb_the_format_states() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(FILL, &[]),
                    color_object(SOLID_COLOR, 37, 0x80ff8040),
                ],
                Some(vec![-1, 0, 1]),
            ),
            0,
            &[square()],
            None,
        );
        let commands = shape_commands(&shape);
        let at = command_index(&commands, "beginFill");
        assert_eq!(number_at(&commands, at + 2) as u32, 0xff8040ff);
        assert_f32_close_6(number_at(&commands, at + 3), 0x80 as f64 / 255.0);
    }

    #[test]
    fn falls_back_to_the_colour_the_format_states_when_a_solid_colour_omits_it() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(FILL, &[]),
                    object(SOLID_COLOR, &[]),
                ],
                Some(vec![-1, 0, 1]),
            ),
            0,
            &[square()],
            None,
        );
        let commands = shape_commands(&shape);
        let at = command_index(&commands, "beginFill");
        assert_eq!(number_at(&commands, at + 2) as u32, 0x747474ff);
    }

    #[test]
    fn keeps_every_paint_a_shape_states_in_the_order_it_states_them() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(STROKE, &[(47, 4.0)]),
                    color_object(SOLID_COLOR, 37, 0xff00ff00),
                    object(FILL, &[]),
                    color_object(SOLID_COLOR, 37, 0xffff0000),
                    object(FILL, &[]),
                    color_object(SOLID_COLOR, 37, 0xff0000ff),
                ],
                Some(vec![-1, 0, 1, 0, 3, 0, 5]),
            ),
            0,
            &[square()],
            None,
        );
        assert_eq!(
            paint_tokens(&shape),
            ["lineStyle", "beginFill", "beginFill"]
        );
        assert_eq!(draw_count(&shape), 3);
    }

    #[test]
    fn restates_every_path_under_every_paint() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(FILL, &[]),
                    object(SOLID_COLOR, &[]),
                    object(FILL, &[]),
                    object(SOLID_COLOR, &[]),
                ],
                Some(vec![-1, 0, 1, 0, 3]),
            ),
            0,
            &[square(), square()],
            None,
        );
        assert_eq!(draw_count(&shape), 4);
    }

    #[test]
    fn skips_a_paint_the_file_marks_invisible() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(FILL, &[(41, 0.0)]),
                    object(SOLID_COLOR, &[]),
                ],
                Some(vec![-1, 0, 1]),
            ),
            0,
            &[square()],
            None,
        );
        assert!(paint_tokens(&shape).is_empty());
    }

    #[test]
    fn reads_a_fill_rule_of_one_as_even_odd() {
        let non_zero = create_shape();
        let even_odd = create_shape();
        append_rive_shape_paint(
            &non_zero,
            &graph(
                vec![object(SHAPE, &[]), object(FILL, &[(40, 0.0)])],
                Some(vec![-1, 0]),
            ),
            0,
            &[square()],
            None,
        );
        append_rive_shape_paint(
            &even_odd,
            &graph(
                vec![object(SHAPE, &[]), object(FILL, &[(40, 1.0)])],
                Some(vec![-1, 0]),
            ),
            0,
            &[square()],
            None,
        );
        assert_eq!(winding_of(&non_zero), "nonZero");
        assert_eq!(winding_of(&even_odd), "evenOdd");
    }

    #[test]
    fn reports_a_stroke_cap_it_does_not_know() {
        let shape = create_shape();
        let mut diagnostics = Vec::new();
        append_rive_shape_paint(
            &shape,
            &stroke_with(&[(48, 7.0)]),
            0,
            &[line(10.0)],
            Some(&mut diagnostics),
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.stroke-cap-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            diagnostics[0].detail,
            Some(std::collections::HashMap::from([
                (
                    "capValue".to_string(),
                    ImportDiagnosticDetailValue::Number(7.0),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("none".to_string()),
                ),
            ])),
        );
        assert_eq!(cap_of(&shape), "none");
    }

    #[test]
    fn stays_silent_for_a_stroke_cap_the_format_states() {
        let butt = create_shape();
        let square_shape = create_shape();
        let mut diagnostics = Vec::new();
        append_rive_shape_paint(
            &butt,
            &stroke_with(&[(48, 0.0)]),
            0,
            &[line(10.0)],
            Some(&mut diagnostics),
        );
        append_rive_shape_paint(
            &square_shape,
            &stroke_with(&[(48, 2.0)]),
            0,
            &[line(10.0)],
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
        assert_eq!(cap_of(&butt), "none");
        assert_eq!(cap_of(&square_shape), "square");
    }

    #[test]
    fn reports_a_stroke_join_it_does_not_know() {
        let shape = create_shape();
        let mut diagnostics = Vec::new();
        append_rive_shape_paint(
            &shape,
            &stroke_with(&[(49, 9.0)]),
            0,
            &[line(10.0)],
            Some(&mut diagnostics),
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.stroke-join-substituted");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(
            diagnostics[0].detail,
            Some(std::collections::HashMap::from([
                (
                    "joinValue".to_string(),
                    ImportDiagnosticDetailValue::Number(9.0),
                ),
                (
                    "substitutedAs".to_string(),
                    ImportDiagnosticDetailValue::String("miter".to_string()),
                ),
            ])),
        );
        assert_eq!(join_of(&shape), "miter");
    }

    #[test]
    fn stays_silent_for_a_stroke_join_the_format_states() {
        let miter = create_shape();
        let bevel = create_shape();
        let mut diagnostics = Vec::new();
        append_rive_shape_paint(
            &miter,
            &stroke_with(&[(49, 0.0)]),
            0,
            &[line(10.0)],
            Some(&mut diagnostics),
        );
        append_rive_shape_paint(
            &bevel,
            &stroke_with(&[(49, 2.0)]),
            0,
            &[line(10.0)],
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
        assert_eq!(join_of(&miter), "miter");
        assert_eq!(join_of(&bevel), "bevel");
    }

    #[test]
    fn builds_a_gradient_from_its_stops_scaling_each_stop_alpha_by_the_gradient_opacity() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(FILL, &[]),
                    object(
                        LINEAR_GRADIENT,
                        &[(42, 0.0), (33, 0.0), (34, 100.0), (35, 0.0), (46, 0.5)],
                    ),
                    color_number_object(GRADIENT_STOP, 38, 0xffff0000, &[(39, 0.0)]),
                    color_number_object(GRADIENT_STOP, 38, 0x800000ff, &[(39, 1.0)]),
                ],
                Some(vec![-1, 0, 1, 2, 2]),
            ),
            0,
            &[square()],
            None,
        );
        let commands = shape_commands(&shape);
        let at = command_index(&commands, "beginGradientFill");
        assert_eq!(string_at(&commands, at + 2), "linear");
        assert_eq!(
            numbers_at(&commands, at + 3),
            &[0xff0000ff_u32 as f64, 0x0000ffff_u32 as f64],
        );
        let alphas = numbers_at(&commands, at + 4);
        assert_f32_close_6(alphas[0], 0.5);
        assert_f32_close_6(alphas[1], (0x80 as f64 / 255.0) * 0.5);
        assert_eq!(numbers_at(&commands, at + 5), &[0.0, 255.0]);
    }

    #[test]
    fn marks_a_radial_gradient_as_radial() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(FILL, &[]),
                    object(RADIAL_GRADIENT, &[(34, 10.0)]),
                    object(GRADIENT_STOP, &[(39, 0.0)]),
                ],
                Some(vec![-1, 0, 1, 2]),
            ),
            0,
            &[square()],
            None,
        );
        let commands = shape_commands(&shape);
        let at = command_index(&commands, "beginGradientFill");
        assert_eq!(string_at(&commands, at + 2), "radial");
    }

    #[test]
    fn leaves_the_fraction_of_stroke_length_the_trim_states() {
        for (start, end, expected) in [
            (0.0, 1.0, 1.0),
            (0.0, 0.5, 0.5),
            (0.25, 0.75, 0.5),
            (0.0, 0.25, 0.25),
        ] {
            let shape = create_shape();
            append_rive_shape_paint(
                &shape,
                &trimmed_stroke(start, end, 2.0),
                0,
                &[line(100.0)],
                None,
            );
            assert_path_close_1(stroked_length(&shape), expected * 100.0, 1);
        }
    }

    #[test]
    fn consumes_a_sequential_trim_in_run_order_leaving_later_paths_empty() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &trimmed_stroke(0.0, 0.5, 1.0),
            0,
            &[line(150.0), line(50.0)],
            None,
        );
        let lengths = stroked_lengths(&shape);
        assert_eq!(lengths.iter().filter(|value| **value > 0.001).count(), 1);
        assert_path_close_0(
            lengths.into_iter().fold(f64::NEG_INFINITY, f64::max),
            100.0,
            2,
        );
    }

    #[test]
    fn takes_the_same_proportion_out_of_every_path_when_synchronized() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &trimmed_stroke(0.0, 0.5, 2.0),
            0,
            &[line(150.0), line(50.0)],
            None,
        );
        let mut lengths = stroked_lengths(&shape)
            .into_iter()
            .filter(|value| *value > 0.001)
            .collect::<Vec<_>>();
        lengths.sort_by(f64::total_cmp);
        assert_eq!(lengths.len(), 2);
        assert_path_close_0(lengths[0], 25.0, 1);
        assert_path_close_0(lengths[1], 75.0, 1);
    }

    #[test]
    fn wraps_a_span_that_runs_past_the_end_back_to_the_front() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &trimmed_stroke(0.8, 1.1, 2.0),
            0,
            &[line(100.0)],
            None,
        );
        assert_path_close_0(stroked_length(&shape), 30.0, 2);
        assert_eq!(
            stroked_lengths(&shape)
                .into_iter()
                .filter(|value| *value > 0.001)
                .count(),
            2,
        );
    }

    #[test]
    fn drops_the_stroke_entirely_when_the_trim_span_is_empty() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &trimmed_stroke(0.5, 0.5, 2.0),
            0,
            &[line(100.0)],
            None,
        );
        assert_path_close_3(stroked_length(&shape), 0.0, 1);
    }

    #[test]
    fn leaves_a_fill_untouched_by_a_trim_that_belongs_to_a_stroke() {
        let shape = create_shape();
        let graph_with_both = graph(
            vec![
                object(SHAPE, &[]),
                object(FILL, &[]),
                object(SOLID_COLOR, &[]),
                object(STROKE, &[]),
                object(TRIM_PATH, &[(114, 0.0), (115, 0.5), (117, 2.0)]),
            ],
            Some(vec![-1, 0, 1, 0, 3]),
        );
        append_rive_shape_paint(&shape, &graph_with_both, 0, &[line(100.0)], None);
        assert_path_close_0(stroked_length(&shape), 150.0, 2);
    }

    #[test]
    fn alternates_every_static_dash_length_using_the_published_type_and_property_keys() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &dashed_stroke(&[(10.0, false), (5.0, false)], 0.0, false),
            0,
            &[line(40.0)],
            None,
        );
        assert_path_close_3(stroked_length(&shape), 30.0, 3);
    }

    #[test]
    fn resolves_percentage_dash_lengths_against_each_path_length() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &dashed_stroke(&[(0.1, true), (0.05, true)], 0.0, false),
            0,
            &[line(100.0)],
            None,
        );
        assert_path_close_3(stroked_length(&shape), 70.0, 7);
    }

    #[test]
    fn starts_the_pattern_at_an_absolute_or_percentage_offset() {
        for (offset, percentage) in [(5.0, false), (0.125, true)] {
            let shape = create_shape();
            append_rive_shape_paint(
                &shape,
                &dashed_stroke(&[(10.0, false), (10.0, false)], offset, percentage),
                0,
                &[line(40.0)],
                None,
            );
            assert_eq!(first_stroked_data(&shape)[..4], [5.0, 0.0, 15.0, 0.0]);
        }
    }

    #[test]
    fn keeps_alternating_when_a_dash_pattern_has_an_odd_number_of_entries() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &dashed_stroke(&[(10.0, false)], 0.0, false),
            0,
            &[line(40.0)],
            None,
        );
        assert_path_close_3(stroked_length(&shape), 20.0, 2);
    }

    #[test]
    fn emits_no_stroke_geometry_when_every_stated_dash_length_is_zero() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &dashed_stroke(&[(0.0, false), (0.0, false)], 0.0, false),
            0,
            &[line(40.0)],
            None,
        );
        assert_eq!(draw_count(&shape), 0);
    }

    #[test]
    fn leaves_a_fill_untouched_by_a_dash_effect() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(FILL, &[]),
                    object(SOLID_COLOR, &[]),
                    object(DASH_PATH, &[]),
                    object(DASH, &[(692, 5.0)]),
                ],
                Some(vec![-1, 0, 1, 1, 3]),
            ),
            0,
            &[line(40.0)],
            None,
        );
        assert_path_close_3(stroked_length(&shape), 40.0, 1);
    }

    #[test]
    fn carries_stroke_thickness_cap_and_join() {
        let shape = create_shape();
        append_rive_shape_paint(
            &shape,
            &graph(
                vec![
                    object(SHAPE, &[]),
                    object(STROKE, &[(47, 7.0), (48, 1.0), (49, 2.0)]),
                    object(SOLID_COLOR, &[]),
                ],
                Some(vec![-1, 0, 1]),
            ),
            0,
            &[square()],
            None,
        );
        let commands = shape_commands(&shape);
        let at = command_index(&commands, "lineStyle");
        assert_eq!(number_at(&commands, at + 2), 7.0);
        assert_eq!(string_at(&commands, at + 6), "normal");
        assert_eq!(string_at(&commands, at + 7), "round");
        assert_eq!(string_at(&commands, at + 8), "bevel");
    }
}

mod register_rive_paint_handlers {
    use super::*;

    #[test]
    fn claims_fills_and_strokes_through_the_shape_paint_they_share() {
        let mut registry = create_rive_import_registry();
        register_rive_paint_handlers(&mut registry);
        assert!(get_rive_core_object_handler(&registry, FILL as i32).is_some());
        assert!(get_rive_core_object_handler(&registry, STROKE as i32).is_some());
    }

    #[test]
    fn claims_gradients_their_stops_and_the_stroke_effects_and_gives_none_of_them_a_node() {
        let mut registry = create_rive_import_registry();
        register_rive_paint_handlers(&mut registry);
        for type_key in [
            SOLID_COLOR,
            LINEAR_GRADIENT,
            RADIAL_GRADIENT,
            GRADIENT_STOP,
            TRIM_PATH,
            DASH_PATH,
            DASH,
        ] {
            assert!(get_rive_core_object_handler(&registry, type_key as i32).is_some());
        }
    }
}

fn assert_f32_close_6(actual: f64, expected: f64) {
    // D1 f32 bound (TS: 0.0000005)
    let bound = 0.0000005_f64.max(4.0 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound);
}

fn assert_path_close_0(actual: f64, expected: f64, accumulation_count: usize) {
    // D1 f32 bound (TS: 0.5)
    let bound =
        0.5_f64.max(accumulation_count as f64 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound);
}

fn assert_path_close_1(actual: f64, expected: f64, accumulation_count: usize) {
    // D1 f32 bound (TS: 0.05)
    let bound =
        0.05_f64.max(accumulation_count as f64 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound);
}

fn assert_path_close_3(actual: f64, expected: f64, accumulation_count: usize) {
    // D1 f32 bound (TS: 0.0005)
    let bound = 0.0005_f64
        .max(accumulation_count as f64 * f64::from(f32::EPSILON) * expected.abs().max(1.0));
    assert!((actual - expected).abs() <= bound);
}

fn cap_of(shape: &Ref<Shape>) -> String {
    let commands = shape_commands(shape);
    let at = command_index(&commands, "lineStyle");
    return string_at(&commands, at + 7).to_string();
}

fn color_number_object(
    type_key: u64,
    color_key: u64,
    color: u32,
    numbers: &[(u64, f32)],
) -> RiveCoreObject {
    let mut source = object(type_key, numbers);
    source.properties.push(RiveProperty {
        key: color_key,
        r#type: RiveFieldType::Color,
        value: RiveValue::Color(color),
    });
    return source;
}

fn color_object(type_key: u64, key: u64, value: u32) -> RiveCoreObject {
    return color_number_object(type_key, key, value, &[]);
}

fn command_index(commands: &[ShapeCommandToken], key: &str) -> usize {
    return commands
        .iter()
        .position(|token| token.as_str() == Some(key))
        .unwrap();
}

fn dashed_stroke(
    lengths: &[(f32, bool)],
    offset: f32,
    offset_is_percentage: bool,
) -> RiveArtboardGraph {
    let mut objects = vec![
        object(SHAPE, &[]),
        object(STROKE, &[]),
        object(SOLID_COLOR, &[]),
        object(
            DASH_PATH,
            &[(690, offset), (691, u8::from(offset_is_percentage) as f32)],
        ),
    ];
    let mut parents = vec![-1, 0, 1, 1];
    for (value, percentage) in lengths {
        objects.push(object(
            DASH,
            &[(692, *value), (693, u8::from(*percentage) as f32)],
        ));
        parents.push(3);
    }
    return graph(objects, Some(parents));
}

fn draw_count(shape: &Ref<Shape>) -> usize {
    return shape_commands(shape)
        .iter()
        .filter(|token| token.as_str() == Some("drawPath"))
        .count();
}

fn first_stroked_data(shape: &Ref<Shape>) -> Vec<f64> {
    let commands = shape_commands(shape);
    let at = command_index(&commands, "drawPath");
    return numbers_at(&commands, at + 3).to_vec();
}

fn graph(objects: Vec<RiveCoreObject>, parents: Option<Vec<i32>>) -> RiveArtboardGraph {
    return RiveArtboardGraph {
        parent_indices: parents.unwrap_or_else(|| {
            objects
                .iter()
                .enumerate()
                .map(|(index, _)| if index == 0 { -1 } else { 0 })
                .collect()
        }),
        stream_end: objects.len(),
        stream_start: 0,
        objects,
    };
}

fn join_of(shape: &Ref<Shape>) -> String {
    let commands = shape_commands(shape);
    let at = command_index(&commands, "lineStyle");
    return string_at(&commands, at + 8).to_string();
}

fn line(length: f32) -> RivePathRecord {
    return RivePathRecord {
        commands: vec![PathCommand::MoveTo as u8, PathCommand::LineTo as u8],
        data: vec![0.0, 0.0, length, 0.0],
        path_index: 0,
        winding: PathWinding::NonZero,
    };
}

fn number_at(commands: &[ShapeCommandToken], index: usize) -> f64 {
    return commands[index].as_number().unwrap();
}

fn numbers_at(commands: &[ShapeCommandToken], index: usize) -> &[f64] {
    return commands[index].as_numbers().unwrap();
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

fn paint_tokens(shape: &Ref<Shape>) -> Vec<String> {
    return shape_commands(shape)
        .iter()
        .filter_map(|token| token.as_str())
        .filter(|token| {
            matches!(
                *token,
                "beginFill" | "beginGradientFill" | "lineStyle" | "lineGradientStyle"
            )
        })
        .map(str::to_string)
        .collect();
}

fn shape_commands(shape: &Ref<Shape>) -> Vec<ShapeCommandToken> {
    return shape.read().unwrap().data.commands.clone();
}

fn square() -> RivePathRecord {
    return line(10.0);
}

fn square_path() -> RivePathRecord {
    return RivePathRecord {
        commands: vec![
            PathCommand::MoveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::Close as u8,
        ],
        data: vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
        path_index: 0,
        winding: PathWinding::NonZero,
    };
}

fn string_at(commands: &[ShapeCommandToken], index: usize) -> &str {
    return commands[index].as_str().unwrap();
}

fn stroke_with(properties: &[(u64, f32)]) -> RiveArtboardGraph {
    return graph(
        vec![
            object(SHAPE, &[]),
            object(STROKE, properties),
            object(SOLID_COLOR, &[]),
        ],
        Some(vec![-1, 0, 1]),
    );
}

fn stroked_length(shape: &Ref<Shape>) -> f64 {
    return stroked_lengths(shape).into_iter().sum();
}

fn stroked_lengths(shape: &Ref<Shape>) -> Vec<f64> {
    let commands = shape_commands(shape);
    let mut lengths = Vec::new();
    for (index, token) in commands.iter().enumerate() {
        if token.as_str() != Some("drawPath") {
            continue;
        }
        let mut path: Path = create_path();
        path.commands = numbers_at(&commands, index + 2)
            .iter()
            .map(|value| *value as u8)
            .collect();
        path.data = numbers_at(&commands, index + 3).to_vec();
        lengths.push(get_path_length(&path, None));
    }
    return lengths;
}

fn trimmed_stroke(start: f32, end: f32, mode: f32) -> RiveArtboardGraph {
    return graph(
        vec![
            object(SHAPE, &[]),
            object(STROKE, &[]),
            object(SOLID_COLOR, &[]),
            object(TRIM_PATH, &[(114, start), (115, end), (117, mode)]),
        ],
        Some(vec![-1, 0, 1, 1]),
    );
}

fn winding_of(shape: &Ref<Shape>) -> String {
    let commands = shape_commands(shape);
    let at = command_index(&commands, "drawPath");
    return string_at(&commands, at + 4).to_string();
}
