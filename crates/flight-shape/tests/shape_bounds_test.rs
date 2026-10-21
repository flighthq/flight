use flight_geometry::create_rectangle;
use flight_shape::contract::*;

use crate::support::*;

mod bounds_source_parity {
    use super::*;
    use flight_path::PathCommand;

    #[test]
    fn returns_false_for_an_unknown_command_without_inventing_geometry() {
        let shape = registered_shape(Some(vec![
            string("__test.missing__"),
            number(2.0),
            number(1.0),
            number(2.0),
        ]));
        let mut out = create_rectangle(10.0, 20.0, 30.0, 40.0);
        assert!(!compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert_eq!(rect_values(&out), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn keeps_known_contributions_while_reporting_an_incomplete_stream() {
        let shape = registered_shape(None);
        append_shape_rectangle(&shape, 10.0, 20.0, 30.0, 40.0);
        shape
            .write()
            .unwrap()
            .shape_commands_mut()
            .extend([string("__test.missing-after-known__"), number(0.0)]);
        let mut out = empty_rect();
        assert!(!compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert_eq!(rect_values(&out), (10.0, 20.0, 30.0, 40.0));
    }

    #[test]
    fn selects_fill_only_or_ink_inclusive_contributions_from_the_same_binding() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(10.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_rectangle(&shape, 0.0, 0.0, 100.0, 50.0);
        let mut fill = empty_rect();
        let mut ink = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut fill,
            &*shape.read().unwrap(),
            Some(ShapeBoundsMode::Fill)
        ));
        assert!(compute_shape_bounds_rectangle(
            &mut ink,
            &*shape.read().unwrap(),
            Some(ShapeBoundsMode::Ink)
        ));
        assert_eq!(rect_values(&fill), (0.0, 0.0, 100.0, 50.0));
        assert_eq!(rect_values(&ink), (-5.0, -5.0, 110.0, 60.0));
    }

    #[test]
    fn resolves_a_miter_from_adjacent_segment_summaries() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(30.0),
            0x000000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(6.0),
        );
        append_shape_move_to(&shape, -110.0, -110.0);
        append_shape_line_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 110.0, -110.0);
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert!(out.y + out.height > 18.0);
    }

    #[test]
    fn falls_back_to_the_half_width_bevel_envelope_beyond_the_miter_limit() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(30.0),
            0x000000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(1.0),
        );
        append_shape_move_to(&shape, -110.0, -110.0);
        append_shape_line_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 110.0, -110.0);
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert!(((out.y + out.height) as f64 - 15.0).abs() < 1e-4);
    }

    #[test]
    fn includes_square_cap_extension_for_an_open_stroke() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(10.0),
            0x000000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::Square),
            Some(JointStyle::Round),
            None,
        );
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 100.0, 0.0);
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert_eq!(rect_values(&out), (-5.0, -5.0, 110.0, 10.0));
    }

    #[test]
    fn tracks_close_as_the_final_segment_and_last_to_first_join() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(10.0),
            0x000000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(4.0),
        );
        append_shape_path(
            &shape,
            &[
                PathCommand::MoveTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::Close as u8,
            ],
            &[0.0, 0.0, 100.0, 0.0, 50.0, 100.0],
            None,
        );
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert!(out.x < 0.0);
        assert!(out.y + out.height > 100.0);
    }

    #[test]
    fn uses_the_correct_axes_for_cubic_extrema() {
        let shape = registered_shape(None);
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_cubic_curve_to(&shape, 0.0, 0.0, 200.0, 150.0, 200.0, 0.0);
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            Some(ShapeBoundsMode::Fill)
        ));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 200.0);
        assert!((out.height as f64 - 200.0 / 3.0).abs() < 1e-4);
    }

    #[test]
    fn uses_center_and_radii_semantics_for_ellipse_bounds() {
        let shape = registered_shape(None);
        append_shape_ellipse(&shape, 100.0, 100.0, 60.0, 30.0);
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            Some(ShapeBoundsMode::Fill)
        ));
        assert_eq!(rect_values(&out), (40.0, 70.0, 120.0, 60.0));
    }

    #[test]
    fn includes_endpoint_elliptical_arcs_and_tangent_arcs() {
        let elliptical = registered_shape(None);
        append_shape_move_to(&elliptical, 0.0, 0.0);
        append_shape_elliptical_arc_to(&elliptical, 50.0, 25.0, 0.0, false, true, 100.0, 0.0);
        let mut elliptical_bounds = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut elliptical_bounds,
            &*elliptical.read().unwrap(),
            Some(ShapeBoundsMode::Fill)
        ));
        assert_eq!(rect_values(&elliptical_bounds), (0.0, -25.0, 100.0, 25.0));

        let tangent = registered_shape(None);
        append_shape_move_to(&tangent, 0.0, 0.0);
        append_shape_tangent_arc_to(&tangent, 100.0, 0.0, 100.0, 100.0, 20.0);
        let mut tangent_bounds = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut tangent_bounds,
            &*tangent.read().unwrap(),
            Some(ShapeBoundsMode::Fill)
        ));
        assert_eq!(tangent_bounds.x, 0.0);
        assert_eq!(tangent_bounds.y, 0.0);
        assert_eq!(tangent_bounds.width, 100.0);
        assert!((tangent_bounds.height as f64 - 20.0).abs() < 1e-4);
    }

    #[test]
    fn keeps_rounded_rectangle_bounds_equal_to_its_authored_rectangle() {
        let shape = registered_shape(None);
        append_shape_rounded_rectangle(&shape, 10.0, 20.0, 100.0, 50.0, 24.0);
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            Some(ShapeBoundsMode::Fill)
        ));
        assert_eq!(rect_values(&out), (10.0, 20.0, 100.0, 50.0));
    }

    #[test]
    fn passes_only_the_registered_command_arguments_through_the_reusable_cursor() {
        let key = "__test.cursor__";
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let recorder = seen.clone();
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        register_shape_bounds_command(
            &state,
            ShapeBoundsCommand {
                fill_bounds: Some(std::sync::Arc::new(move |context, command| {
                    recorder.lock().unwrap().push(format!(
                        "{:?} {:?} {:?} {:?}",
                        ShapeCommandArgumentCursor::length(command),
                        ShapeCommandArgumentCursor::get_argument(command, usize::MAX).is_none(),
                        ShapeCommandArgumentCursor::get_argument(command, 0).is_some(),
                        ShapeCommandArgumentCursor::get_argument(command, 2).is_none()
                    ));
                    let x = match ShapeCommandArgumentCursor::get_argument(command, 0) {
                        Some(ShapeCommandToken::Number(value)) => *value,
                        _ => 0.0,
                    };
                    let y = match ShapeCommandArgumentCursor::get_argument(command, 1) {
                        Some(ShapeCommandToken::Number(value)) => *value,
                        _ => 0.0,
                    };
                    ShapeBoundsContext::expand_point(context, x, y);
                })),
                key: String::from(key),
                stroke_bounds: None,
            },
        );
        let partial = PartialShape {
            data: Some(PartialShapeData {
                bounds_state: Some(state),
                commands: Some(vec![
                    string(key),
                    number(2.0),
                    number(7.0),
                    number(9.0),
                    string("drawRectangle"),
                    number(4.0),
                    number(0.0),
                    number(0.0),
                    number(1.0),
                    number(1.0),
                ]),
            }),
            node: partial_node(),
        };
        let shape = create_shape(Some(&partial));
        let mut out = empty_rect();
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            Some(ShapeBoundsMode::Fill)
        ));
        assert_eq!(
            *seen.lock().unwrap(),
            vec![String::from("2 true true true")]
        );
        assert_eq!(rect_values(&out), (0.0, 0.0, 7.0, 9.0));
    }

    #[test]
    fn explains_each_missing_key_once_without_diagnostic_prose_in_the_core_traversal() {
        let shape = create_shape(Some(&PartialShape {
            data: Some(PartialShapeData {
                bounds_state: None,
                commands: Some(vec![
                    string("__test.a__"),
                    number(0.0),
                    string("__test.b__"),
                    number(0.0),
                    string("__test.a__"),
                    number(0.0),
                ]),
            }),
            node: partial_node(),
        }));
        let explanation =
            explain_shape_bounds(&*shape.read().unwrap(), Some(ShapeBoundsMode::Fill));
        assert_eq!(
            explanation,
            ShapeBoundsExplanation {
                complete: false,
                missing_command_keys: vec![String::from("__test.a__"), String::from("__test.b__")],
                mode: ShapeBoundsMode::Fill,
            }
        );
    }

    #[test]
    fn miter_limit_uses_canvas_default_10_for_nonpositive_or_nonfinite_values() {
        assert_eq!(normalize_shape_stroke_miter_limit(0.0), 10.0);
        assert_eq!(normalize_shape_stroke_miter_limit(-2.0), 10.0);
        assert_eq!(normalize_shape_stroke_miter_limit(f64::INFINITY), 10.0);
        assert_eq!(normalize_shape_stroke_miter_limit(f64::NAN), 10.0);
        assert_eq!(normalize_shape_stroke_miter_limit(3.0), 3.0);
    }

    #[test]
    fn stroke_width_preserves_zero_and_uses_canvas_default_1_otherwise() {
        assert_eq!(normalize_shape_stroke_width(0.0), 0.0);
        assert_eq!(normalize_shape_stroke_width(-2.0), 1.0);
        assert_eq!(normalize_shape_stroke_width(f64::INFINITY), 1.0);
        assert_eq!(normalize_shape_stroke_width(f64::NAN), 1.0);
        assert_eq!(normalize_shape_stroke_width(3.0), 3.0);
    }

    #[test]
    fn bounds_guard_exposes_missing_commands_to_an_installed_policy() {
        let state = create_shape_bounds_state();
        register_default_shape_bounds_commands(&state);
        let misses = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let recorder = misses.clone();
        set_shape_bounds_guard(
            &state,
            Some(std::sync::Arc::new(move |_shape, _mode, key| {
                recorder.lock().unwrap().push(String::from(key));
            })),
        );
        let shape = create_shape(Some(&PartialShape {
            data: Some(PartialShapeData {
                bounds_state: Some(state),
                commands: Some(vec![string("__test.guard-callback__"), number(0.0)]),
            }),
            node: partial_node(),
        }));
        assert!(!compute_shape_bounds_rectangle(
            &mut empty_rect(),
            &*shape.read().unwrap(),
            None
        ));
        assert_eq!(
            *misses.lock().unwrap(),
            vec![String::from("__test.guard-callback__")]
        );
    }

    #[test]
    fn default_handlers_are_available_for_paired_registration() {
        let shape = shape();
        let mut context = recording();
        default_shape_bounds_cubic_curve_to(
            &mut context,
            &args(vec![
                number(1.0),
                number(2.0),
                number(3.0),
                number(4.0),
                number(5.0),
                number(6.0),
            ]),
        );
        default_shape_bounds_draw_circle(
            &mut context,
            &args(vec![number(0.0), number(0.0), number(1.0)]),
        );
        default_shape_bounds_draw_ellipse(
            &mut context,
            &args(vec![number(0.0), number(0.0), number(1.0), number(2.0)]),
        );
        default_shape_bounds_draw_path(
            &mut context,
            &args(vec![numbers(&[1.0]), numbers(&[0.0, 0.0])]),
        );
        default_shape_bounds_draw_rectangle(
            &mut context,
            &args(vec![number(0.0), number(0.0), number(1.0), number(1.0)]),
        );
        default_shape_bounds_draw_rounded_rectangle(
            &mut context,
            &args(vec![
                number(0.0),
                number(0.0),
                number(1.0),
                number(1.0),
                number(1.0),
            ]),
        );
        default_shape_bounds_expand_point_pairs(&mut context, &args(vec![numbers(&[0.0, 0.0])]));
        default_shape_bounds_flush(&mut context);
        default_shape_bounds_line_style(
            &mut context,
            &args(vec![
                number(1.0),
                number(1.0),
                number(1.0),
                ShapeCommandToken::Boolean(false),
                string("normal"),
                string("none"),
                string("round"),
                number(3.0),
            ]),
        );
        default_shape_bounds_line_to(&mut context, &args(vec![number(0.0), number(0.0)]));
        default_shape_bounds_move_to(&mut context, &args(vec![number(0.0), number(0.0)]));
        default_shape_bounds_quadratic_curve_to(
            &mut context,
            &args(vec![number(0.0), number(0.0), number(1.0), number(1.0)]),
        );
        assert!(context.circles >= 1 && context.ellipses >= 1 && context.rectangles >= 2);
        drop(shape);
    }
}

mod compute_shape_bounds_rectangle {
    use super::*;

    #[test]
    fn reports_complete_with_zero_bounds_for_an_empty_shape() {
        let shape = create_shape(None);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert_eq!((out.width, out.height), (0.0, 0.0));
    }
}

mod default_shape_bounds_cubic_curve_to {
    use super::*;

    #[test]
    fn forwards_a_cubic_curve() {
        let mut context = recording();
        default_shape_bounds_cubic_curve_to(
            &mut context,
            &args(vec![
                number(1.0),
                number(2.0),
                number(3.0),
                number(4.0),
                number(5.0),
                number(6.0),
            ]),
        );
        assert_eq!(context.curves, 1);
    }
}

mod default_shape_bounds_draw_circle {
    use super::*;

    #[test]
    fn forwards_a_circle() {
        let mut context = recording();
        default_shape_bounds_draw_circle(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0)]),
        );
        assert_eq!(context.circles, 1);
    }
}

mod default_shape_bounds_draw_ellipse {
    use super::*;

    #[test]
    fn forwards_an_ellipse() {
        let mut context = recording();
        default_shape_bounds_draw_ellipse(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0), number(4.0)]),
        );
        assert_eq!(context.ellipses, 1);
    }
}

mod default_shape_bounds_draw_path {
    use super::*;

    #[test]
    fn replays_the_path_verbs() {
        let mut context = recording();
        let tokens = vec![numbers(&[1.0, 2.0]), numbers(&[0.0, 0.0, 4.0, 0.0])];
        default_shape_bounds_draw_path(&mut context, &args(tokens));
        assert_eq!(context.moves, 1);
        assert_eq!(context.lines, 1);
    }
}

mod default_shape_bounds_draw_rectangle {
    use super::*;

    #[test]
    fn forwards_a_rectangle() {
        let mut context = recording();
        default_shape_bounds_draw_rectangle(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0), number(4.0)]),
        );
        assert_eq!(context.rectangles, 1);
    }
}

mod default_shape_bounds_draw_rounded_rectangle {
    use super::*;

    #[test]
    fn forwards_a_rounded_rectangle() {
        let mut context = recording();
        default_shape_bounds_draw_rounded_rectangle(
            &mut context,
            &args(vec![
                number(1.0),
                number(2.0),
                number(3.0),
                number(4.0),
                number(1.0),
            ]),
        );
        assert_eq!(context.rectangles, 1);
    }
}

mod default_shape_bounds_expand_point_pairs {
    use super::*;

    #[test]
    fn expands_each_point_pair() {
        let mut context = recording();
        default_shape_bounds_expand_point_pairs(
            &mut context,
            &args(vec![numbers(&[0.0, 0.0, 2.0, 3.0])]),
        );
        assert_eq!(context.expanded, 2);
    }
}

mod default_shape_bounds_flush {
    use super::*;

    #[test]
    fn flushes_the_active_subpath() {
        let mut context = recording();
        default_shape_bounds_flush(&mut context);
        assert_eq!(context.flushed, 1);
    }
}

mod default_shape_bounds_line_style {
    use super::*;

    #[test]
    fn applies_the_authored_stroke_style() {
        let mut context = recording();
        let tokens = vec![
            number(2.0),
            number(0xffffffffu32 as f64),
            number(1.0),
            ShapeCommandToken::Boolean(false),
            string("normal"),
            string("round"),
            string("bevel"),
            number(4.0),
        ];
        default_shape_bounds_line_style(&mut context, &args(tokens));
        assert_eq!(context.styles, 1);
    }
}

mod default_shape_bounds_line_to {
    use super::*;

    #[test]
    fn forwards_a_line_to() {
        let mut context = recording();
        default_shape_bounds_line_to(&mut context, &args(vec![number(2.0), number(3.0)]));
        assert_eq!(context.lines, 1);
    }
}

mod default_shape_bounds_move_to {
    use super::*;

    #[test]
    fn forwards_a_move_to() {
        let mut context = recording();
        default_shape_bounds_move_to(&mut context, &args(vec![number(2.0), number(3.0)]));
        assert_eq!(context.moves, 1);
    }
}

mod default_shape_bounds_quadratic_curve_to {
    use super::*;

    #[test]
    fn forwards_a_quadratic_curve() {
        let mut context = recording();
        default_shape_bounds_quadratic_curve_to(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0), number(4.0)]),
        );
        assert_eq!(context.curves, 1);
    }
}

mod explain_shape_bounds {
    use super::*;

    #[test]
    fn reports_an_empty_shape_as_complete() {
        let shape = create_shape(None);
        let explanation = explain_shape_bounds(&*shape.read().unwrap(), None);
        assert!(explanation.complete);
        assert!(explanation.missing_command_keys.is_empty());
    }
}

mod normalize_shape_stroke_miter_limit {
    use super::*;

    #[test]
    fn keeps_a_positive_finite_limit_and_defaults_otherwise() {
        assert_eq!(normalize_shape_stroke_miter_limit(4.0), 4.0);
        assert_eq!(normalize_shape_stroke_miter_limit(0.0), 10.0);
        assert_eq!(normalize_shape_stroke_miter_limit(f64::NAN), 10.0);
    }
}

mod normalize_shape_stroke_width {
    use super::*;

    #[test]
    fn keeps_zero_and_rejects_nonfinite_widths() {
        assert_eq!(normalize_shape_stroke_width(0.0), 0.0);
        assert_eq!(normalize_shape_stroke_width(f64::INFINITY), 1.0);
        assert_eq!(normalize_shape_stroke_width(2.0), 2.0);
    }
}
