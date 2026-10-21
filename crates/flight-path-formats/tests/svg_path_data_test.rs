use flight_path::{Path, PathCommand, PathSegment, create_path, for_each_path_segment};
use flight_path_formats::contract::*;

fn collect_segments(path: &Path) -> Vec<PathSegment> {
    let mut segments: Vec<PathSegment> = Vec::new();
    for_each_path_segment(path, &mut |segment: PathSegment| segments.push(segment));
    return segments;
}

fn kinds(segments: &[PathSegment]) -> Vec<&'static str> {
    return segments
        .iter()
        .map(|segment| match segment {
            PathSegment::MoveTo { .. } => "moveTo",
            PathSegment::LineTo { .. } => "lineTo",
            PathSegment::QuadraticCurveTo { .. } => "quadraticCurveTo",
            PathSegment::CubicCurveTo { .. } => "cubicCurveTo",
            PathSegment::Close => "close",
        })
        .collect();
}

fn values(segment: &PathSegment) -> Vec<f64> {
    return match *segment {
        PathSegment::MoveTo { x, y } | PathSegment::LineTo { x, y } => vec![x, y],
        PathSegment::QuadraticCurveTo {
            control_x,
            control_y,
            x,
            y,
        } => vec![control_x, control_y, x, y],
        PathSegment::CubicCurveTo {
            control_x1,
            control_y1,
            control_x2,
            control_y2,
            x,
            y,
        } => vec![control_x1, control_y1, control_x2, control_y2, x, y],
        PathSegment::Close => vec![],
    };
}

fn last_point(segments: &[PathSegment]) -> (f64, f64) {
    let PathSegment::CubicCurveTo { x, y, .. } = segments[segments.len() - 1] else {
        panic!("expected a trailing cubic");
    };
    return (x, y);
}

fn precision(value: Option<f64>) -> SvgPathDataFormatOptions {
    return SvgPathDataFormatOptions { precision: value };
}

fn explained(position: usize, reason: &str) -> Option<SvgPathDataExplanation> {
    return Some(SvgPathDataExplanation {
        position,
        reason: reason.to_string(),
    });
}

fn parsed(d: &str) -> Vec<PathSegment> {
    return collect_segments(&parse_svg_path_data(d).expect("well-formed"));
}

mod append_svg_path_data {
    use super::*;

    #[test]
    fn appends_into_an_existing_path_without_clearing_it() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M0 0 L10 0");
        let ok = append_svg_path_data(&mut path, "M20 20 L30 20");
        assert!(ok);
        assert_eq!(
            kinds(&collect_segments(&path)),
            vec!["moveTo", "lineTo", "moveTo", "lineTo"]
        );
    }

    #[test]
    fn returns_false_on_malformed_input() {
        let mut path = create_path();
        assert!(!append_svg_path_data(&mut path, "L10 10"));
    }

    #[test]
    fn does_not_partially_mutate_the_destination_on_malformed_input() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M1 2 L3 4");
        let commands = path.commands.clone();
        let data = path.data.clone();
        assert!(!append_svg_path_data(&mut path, "M10 20 L30"));
        assert_eq!(path.commands, commands);
        assert_eq!(path.data, data);
    }

    #[test]
    fn keeps_the_destination_buffers_and_winding() {
        let mut path = create_path();
        path.winding = flight_path::PathWinding::EvenOdd;
        path.commands.reserve(64);
        let capacity = path.commands.capacity();
        assert!(append_svg_path_data(&mut path, "M0 0 L1 1"));
        assert_eq!(path.commands.capacity(), capacity);
        assert_eq!(path.winding, flight_path::PathWinding::EvenOdd);
    }

    #[test]
    fn appends_nothing_for_empty_input() {
        let mut path = create_path();
        assert!(append_svg_path_data(&mut path, " \t,"));
        assert!(path.commands.is_empty() && path.data.is_empty());
    }
}

mod explain_svg_path_data {
    use super::*;

    #[test]
    fn returns_null_for_valid_input_and_locates_malformed_input() {
        assert_eq!(explain_svg_path_data("M0 0 L1 1"), None);
        assert_eq!(
            explain_svg_path_data("L10 10"),
            explained(0, "expected-moveto")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 X10 10"),
            explained(5, "expected-command")
        );
    }

    #[test]
    fn reports_utf16_code_unit_positions() {
        // Parsing stops at the first non-ASCII unit, so a reported position is the UTF-16 index of
        // that unit; an unexpected character in an operand run is a missing coordinate there.
        assert_eq!(
            explain_svg_path_data("M0 0Z\u{1F600}"),
            explained(5, "expected-command")
        );
        assert_eq!(
            explain_svg_path_data("\u{1F600}"),
            explained(0, "expected-command")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 \u{e9}"),
            explained(5, "expected-coordinate-pair")
        );
    }

    #[test]
    fn reports_each_stable_reason_at_the_source_position() {
        assert_eq!(
            explain_svg_path_data("M0 0 L10"),
            explained(8, "expected-coordinate-pair")
        );
        assert_eq!(
            explain_svg_path_data("M"),
            explained(1, "expected-coordinate-pair")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 H"),
            explained(6, "expected-coordinate")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 C1 2 3 4 5"),
            explained(15, "expected-cubic-coordinates")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 S1 2 3"),
            explained(11, "expected-smooth-cubic-coordinates")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 Q1 2 3"),
            explained(11, "expected-quadratic-coordinates")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 T1"),
            explained(7, "expected-coordinate-pair")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 A5 5 0 0 1 10"),
            explained(18, "expected-arc-parameters")
        );
        assert_eq!(
            explain_svg_path_data("  z"),
            explained(2, "expected-moveto")
        );
    }

    #[test]
    fn keeps_reading_operands_after_a_failed_flag_as_the_source_does() {
        // largeArc/sweep fail on '5' without consuming it; x and y then read "5" and "6", so the
        // failure is reported after them.
        assert_eq!(
            explain_svg_path_data("M0 0 A1 1 0 5 6"),
            explained(15, "expected-arc-parameters")
        );
    }

    #[test]
    fn stops_an_operand_run_at_any_letter() {
        assert_eq!(
            explain_svg_path_data("M0 0 1 1 k"),
            explained(9, "expected-command")
        );
        assert_eq!(
            explain_svg_path_data("M0 0 L1 1 #"),
            explained(10, "expected-coordinate-pair")
        );
    }
}

mod format_svg_path_data {
    use super::*;

    #[test]
    fn emits_absolute_m_l_c_q_z_commands_per_segment_kind() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M0 0 L10 0 Q15 5 20 0 C22 2 24 2 26 0 Z");
        assert_eq!(
            format_svg_path_data(&path, None),
            "M0 0L10 0Q15 5 20 0C22 2 24 2 26 0Z"
        );
    }

    #[test]
    fn rounds_coordinates_and_trims_trailing_zeros_with_a_precision_option() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M0.123456 0.5 L10.987654 20");
        assert_eq!(
            format_svg_path_data(&path, Some(&precision(Some(2.0)))),
            "M0.12 0.5L10.99 20"
        );
    }

    #[test]
    fn emits_full_precision_by_default() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M0.5 0.25 L1.5 2.75");
        assert_eq!(format_svg_path_data(&path, None), "M0.5 0.25L1.5 2.75");
        assert_eq!(
            format_svg_path_data(&path, Some(&precision(None))),
            "M0.5 0.25L1.5 2.75"
        );
    }

    #[test]
    fn emits_no_a_command_arcs_are_stored_as_cubics() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M0 0 A5 5 0 0 1 10 0");
        let d = format_svg_path_data(&path, None);
        assert!(!d.contains('A'));
        assert!(d.starts_with("M0 0C"));
    }

    #[test]
    fn keeps_an_explicit_zero_precision_distinct_from_omitted() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M1.5 -1.5 L2.4 -2.5");
        assert_eq!(format_svg_path_data(&path, None), "M1.5 -1.5L2.4 -2.5");
        // Math.round ties toward +infinity: 1.5 → 2, -1.5 → -1, -2.5 → -2.
        assert_eq!(
            format_svg_path_data(&path, Some(&precision(Some(0.0)))),
            "M2 -1L2 -2"
        );
    }

    #[test]
    fn spells_numbers_as_javascript_string_does() {
        let mut path = create_path();
        append_svg_path_data(
            &mut path,
            "M1e21 1e-7 L123456789012345680000 0.000001 L-0 0.1",
        );
        assert_eq!(
            format_svg_path_data(&path, None),
            "M1e+21 1e-7L123456789012345680000 0.000001L0 0.1"
        );
        let mut tiny = create_path();
        append_svg_path_data(
            &mut tiny,
            "M1.5e-10 -2.25e30 L5e-324 1.7976931348623157e308",
        );
        assert_eq!(
            format_svg_path_data(&tiny, None),
            "M1.5e-10 -2.25e+30L5e-324 1.7976931348623157e+308"
        );
    }

    #[test]
    fn normalizes_a_rounded_negative_zero_to_zero() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M-0.001 -0.004");
        assert_eq!(
            format_svg_path_data(&path, Some(&precision(Some(2.0)))),
            "M0 0"
        );
    }

    #[test]
    fn rounds_to_tens_with_a_negative_precision() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M123 125 L-125 -0.4");
        // factor 0.1: 12.3 → 12, 12.5 → 13, -12.5 → -12 (ties toward +infinity); -0.04 → -0 → "0".
        assert_eq!(
            format_svg_path_data(&path, Some(&precision(Some(-1.0)))),
            "M120 130L-120 0"
        );
    }

    #[test]
    fn applies_a_fractional_precision_through_the_power_of_ten() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M1 0");
        // factor 10 ** 0.5: Math.round(3.1622776601683795) / factor. The last ulp of a fractional
        // power is platform-approximated, so the value is checked numerically, not by spelling.
        let d = format_svg_path_data(&path, Some(&precision(Some(0.5))));
        let x: f64 = d[1..d.find(' ').unwrap()].parse().unwrap();
        assert!((x - 0.9486832980505138).abs() < 1e-15);
        assert!(d.ends_with(" 0"));
    }

    #[test]
    fn yields_nan_for_non_finite_or_overflowing_precision() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M1 0");
        // NaN factor; Infinity/Infinity; 0/0; and 10 ** 400 overflowing to Infinity.
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 400.0] {
            assert_eq!(
                format_svg_path_data(&path, Some(&precision(Some(value)))),
                "MNaN NaN"
            );
        }
    }

    #[test]
    fn spells_non_finite_coordinates_as_javascript_does() {
        let mut path = create_path();
        path.commands.push(PathCommand::MoveTo as u8);
        path.data.extend_from_slice(&[f64::NAN, f64::INFINITY]);
        path.commands.push(PathCommand::LineTo as u8);
        path.data.extend_from_slice(&[f64::NEG_INFINITY, -0.0]);
        assert_eq!(
            format_svg_path_data(&path, None),
            "MNaN InfinityL-Infinity 0"
        );
        assert_eq!(
            format_svg_path_data(&path, Some(&precision(Some(2.0)))),
            "MNaN InfinityL-Infinity 0"
        );
    }

    #[test]
    fn keeps_extreme_magnitudes_through_a_precision_option() {
        let mut path = create_path();
        append_svg_path_data(&mut path, "M1e300 -1e-300");
        assert_eq!(
            format_svg_path_data(&path, Some(&precision(Some(2.0)))),
            "M1e+300 0"
        );
    }

    #[test]
    fn emits_an_empty_string_for_an_empty_path() {
        assert_eq!(format_svg_path_data(&create_path(), None), "");
    }
}

mod parse_svg_path_data {
    use super::*;

    #[test]
    fn parses_absolute_moveto_and_lineto() {
        assert_eq!(
            parsed("M0 0 L10 10"),
            vec![
                PathSegment::MoveTo { x: 0.0, y: 0.0 },
                PathSegment::LineTo { x: 10.0, y: 10.0 },
            ]
        );
    }

    #[test]
    fn treats_repeated_moveto_operands_as_implicit_lineto() {
        assert_eq!(
            parsed("M0 0 1 1 2 2"),
            vec![
                PathSegment::MoveTo { x: 0.0, y: 0.0 },
                PathSegment::LineTo { x: 1.0, y: 1.0 },
                PathSegment::LineTo { x: 2.0, y: 2.0 },
            ]
        );
    }

    #[test]
    fn resolves_relative_commands_against_the_current_point() {
        assert_eq!(
            parsed("m10 10 l5 5 l-5 0"),
            vec![
                PathSegment::MoveTo { x: 10.0, y: 10.0 },
                PathSegment::LineTo { x: 15.0, y: 15.0 },
                PathSegment::LineTo { x: 10.0, y: 15.0 },
            ]
        );
    }

    #[test]
    fn treats_repeated_relative_moveto_operands_as_relative_lineto() {
        assert_eq!(
            parsed("m1 1 2 2"),
            vec![
                PathSegment::MoveTo { x: 1.0, y: 1.0 },
                PathSegment::LineTo { x: 3.0, y: 3.0 },
            ]
        );
    }

    #[test]
    fn maps_horizontal_and_vertical_lineto_absolute_and_relative() {
        assert_eq!(
            parsed("M0 0 H10 V20 h5 v-5"),
            vec![
                PathSegment::MoveTo { x: 0.0, y: 0.0 },
                PathSegment::LineTo { x: 10.0, y: 0.0 },
                PathSegment::LineTo { x: 10.0, y: 20.0 },
                PathSegment::LineTo { x: 15.0, y: 20.0 },
                PathSegment::LineTo { x: 15.0, y: 15.0 },
            ]
        );
    }

    #[test]
    fn parses_cubic_curves() {
        assert_eq!(
            parsed("M0 0 C1 2 3 4 5 6"),
            vec![
                PathSegment::MoveTo { x: 0.0, y: 0.0 },
                PathSegment::CubicCurveTo {
                    control_x1: 1.0,
                    control_y1: 2.0,
                    control_x2: 3.0,
                    control_y2: 4.0,
                    x: 5.0,
                    y: 6.0,
                },
            ]
        );
    }

    #[test]
    fn reflects_the_previous_cubic_control_for_the_s_shorthand() {
        assert_eq!(
            parsed("M0 0 C1 2 3 4 5 6 S3 3 4 4")[2],
            PathSegment::CubicCurveTo {
                control_x1: 7.0,
                control_y1: 8.0,
                control_x2: 3.0,
                control_y2: 3.0,
                x: 4.0,
                y: 4.0,
            }
        );
    }

    #[test]
    fn uses_the_current_point_as_the_s_control_when_the_previous_command_was_not_a_cubic() {
        assert_eq!(
            parsed("M0 0 L2 2 S3 3 4 4")[2],
            PathSegment::CubicCurveTo {
                control_x1: 2.0,
                control_y1: 2.0,
                control_x2: 3.0,
                control_y2: 3.0,
                x: 4.0,
                y: 4.0,
            }
        );
    }

    #[test]
    fn parses_quadratic_curves() {
        assert_eq!(
            parsed("M0 0 Q1 1 2 2"),
            vec![
                PathSegment::MoveTo { x: 0.0, y: 0.0 },
                PathSegment::QuadraticCurveTo {
                    control_x: 1.0,
                    control_y: 1.0,
                    x: 2.0,
                    y: 2.0,
                },
            ]
        );
    }

    #[test]
    fn preserves_the_quadratic_command_numeric_value_in_the_parsed_path() {
        let path = parse_svg_path_data("M0 0 Q1 1 2 2").unwrap();
        assert_eq!(PathCommand::QuadraticCurveTo as u8, 3);
        assert_eq!(path.commands, vec![PathCommand::MoveTo as u8, 3]);
    }

    #[test]
    fn reflects_the_previous_quadratic_control_for_the_t_shorthand() {
        assert_eq!(
            parsed("M0 0 Q1 1 2 2 T4 4")[2],
            PathSegment::QuadraticCurveTo {
                control_x: 3.0,
                control_y: 3.0,
                x: 4.0,
                y: 4.0,
            }
        );
    }

    #[test]
    fn uses_the_current_point_as_the_t_control_when_the_previous_command_was_not_a_quadratic() {
        assert_eq!(
            parsed("M0 0 L2 2 T4 4")[2],
            PathSegment::QuadraticCurveTo {
                control_x: 2.0,
                control_y: 2.0,
                x: 4.0,
                y: 4.0,
            }
        );
    }

    #[test]
    fn appends_an_arc_as_cubic_segments_ending_at_the_arc_endpoint() {
        let segments = parsed("M0 0 A5 5 0 0 1 10 0");
        assert_eq!(kinds(&segments)[0], "moveTo");
        assert_eq!(kinds(&segments)[1], "cubicCurveTo");
        let (x, y) = last_point(&segments);
        assert!((x - 10.0).abs() < 5e-7);
        assert!(y.abs() < 5e-7);
    }

    #[test]
    fn starts_an_arc_after_close_at_the_closed_subpath_origin() {
        assert_eq!(
            parsed("M0 0 L10 0 Z A5 5 0 0 1 10 0"),
            parsed("M0 0 L10 0 Z M0 0 A5 5 0 0 1 10 0")
        );
    }

    #[test]
    fn closes_contours_and_returns_the_current_point_to_the_subpath_start() {
        let segments = parsed("M0 0 L10 0 L10 10 Z L5 5");
        assert_eq!(
            kinds(&segments),
            vec!["moveTo", "lineTo", "lineTo", "close", "lineTo"]
        );
        // The lineto after Z starts from the subpath origin (0,0) and goes to (5,5).
        assert_eq!(segments[4], PathSegment::LineTo { x: 5.0, y: 5.0 });
        assert_eq!(
            parsed("M1 1 L9 9 z l1 0")[3],
            PathSegment::LineTo { x: 2.0, y: 1.0 }
        );
    }

    #[test]
    fn tokenizes_numbers_with_no_space_before_a_negative_sign() {
        assert_eq!(
            parsed("M0 0L10-5"),
            vec![
                PathSegment::MoveTo { x: 0.0, y: 0.0 },
                PathSegment::LineTo { x: 10.0, y: -5.0 },
            ]
        );
    }

    #[test]
    fn tokenizes_scientific_notation_and_comma_separators() {
        assert_eq!(
            parsed("M1e1,1e1 L2E1,-1.5e1"),
            vec![
                PathSegment::MoveTo { x: 10.0, y: 10.0 },
                PathSegment::LineTo { x: 20.0, y: -15.0 },
            ]
        );
    }

    #[test]
    fn tokenizes_leading_dots_packed_decimals_explicit_plus_signs_and_trailing_dots() {
        assert_eq!(
            parsed("M.5.5 L+2 +3 L10. 20."),
            vec![
                PathSegment::MoveTo { x: 0.5, y: 0.5 },
                PathSegment::LineTo { x: 2.0, y: 3.0 },
                PathSegment::LineTo { x: 10.0, y: 20.0 },
            ]
        );
    }

    #[test]
    fn tokenizes_a_trailing_dot_before_an_exponent_and_every_separator() {
        assert_eq!(
            parsed("M1.e1\t\n\r\x0c2e+1"),
            vec![PathSegment::MoveTo { x: 10.0, y: 20.0 }]
        );
    }

    #[test]
    fn rejects_a_dangling_exponent_after_backtracking_the_numeric_token() {
        assert!(parse_svg_path_data("M1e 0").is_none());
    }

    #[test]
    fn accepts_large_finite_coordinates_at_both_signs() {
        assert_eq!(
            parsed("M1e308 -1e308"),
            vec![PathSegment::MoveTo {
                x: 1e308,
                y: -1e308
            }]
        );
    }

    #[test]
    fn accepts_an_underflowing_token_as_signed_zero() {
        let segments = parsed("M1e-400 -1e-400");
        let PathSegment::MoveTo { x, y } = segments[0] else {
            panic!("expected moveto");
        };
        assert_eq!((x, y), (0.0, 0.0));
        assert!(x.is_sign_positive() && y.is_sign_negative());
    }

    #[test]
    fn returns_null_when_a_numeric_token_overflows_at_either_sign() {
        assert!(parse_svg_path_data("M1e999 0").is_none());
        assert!(parse_svg_path_data("M-1e999 0").is_none());
    }

    #[test]
    fn parses_packed_arc_flags_with_no_separators() {
        let (x, y) = last_point(&parsed("M0 0A5 5 0 0110 0"));
        assert!((x - 10.0).abs() < 5e-7);
        assert!(y.abs() < 5e-7);
    }

    #[test]
    fn resolves_a_relative_arc_endpoint_against_the_current_point() {
        assert_eq!(
            parsed("M2 3 a5 5 0 0 1 10 0"),
            parsed("M2 3 A5 5 0 0 1 12 3")
        );
    }

    #[test]
    fn returns_an_empty_path_for_empty_or_whitespace_only_input() {
        assert!(parsed("").is_empty());
        assert!(parsed("   \n  ").is_empty());
    }

    #[test]
    fn returns_null_when_the_path_does_not_begin_with_a_moveto() {
        assert!(parse_svg_path_data("L10 10").is_none());
    }

    #[test]
    fn returns_null_on_an_unknown_command_letter() {
        assert!(parse_svg_path_data("M0 0 X10 10").is_none());
    }

    #[test]
    fn returns_null_on_a_short_coordinate_run() {
        assert!(parse_svg_path_data("M0 0 L10").is_none());
        assert!(parse_svg_path_data("M").is_none());
        assert!(parse_svg_path_data("M0 0 C1 2 3 4 5").is_none());
    }

    #[test]
    fn round_trips_representative_path_data_through_format_and_back() {
        let cases = [
            "M0 0 L10 0 L10 10 Z",
            "M0 0 C1 2 3 4 5 6 S7 8 9 10",
            "M0 0 Q1 1 2 2 T4 4 T6 0",
            "m10 10 h20 v20 h-20 z",
            "M0 0 A5 5 0 0 1 10 0 A5 5 0 0 1 20 0",
        ];
        for d in cases {
            let first = parse_svg_path_data(d).expect("first parse");
            let reserialized = format_svg_path_data(&first, None);
            let second = parse_svg_path_data(&reserialized).expect("second parse");
            let a = collect_segments(&first);
            let b = collect_segments(&second);
            assert_eq!(b.len(), a.len());
            for i in 0..a.len() {
                assert_eq!(kinds(&b[i..i + 1]), kinds(&a[i..i + 1]));
                for (bv, av) in values(&b[i]).iter().zip(values(&a[i]).iter()) {
                    assert!((bv - av).abs() < 5e-7, "{d}: {bv} vs {av}");
                }
            }
        }
    }
}
