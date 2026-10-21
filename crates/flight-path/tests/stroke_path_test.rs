use flight_path::contract::*;

mod stroke_path {
    use super::*;

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path(Some(PathWinding::NonZero));
        let style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        let outline = stroke_path(&path, &style, Some(0.25));
        assert!(outline.commands.is_empty());
    }

    #[test]
    fn returns_closed_outline_for_horizontal_line_with_butt_caps() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 10.0;
        style.cap = StrokeCap::Butt;
        let result = stroke_path(&path, &style, Some(0.25));
        assert!(result.commands.contains(&(PathCommand::Close as u8)));
        assert!(result.commands.contains(&(PathCommand::MoveTo as u8)));
        let y_values: Vec<f64> = result.data.iter().enumerate()
            .filter(|(i, _)| i % 2 == 1)
            .map(|(_, &v)| v)
            .collect();
        let max_y = y_values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let min_y = y_values.iter().cloned().fold(f64::INFINITY, f64::min);
        assert!((max_y - 5.0).abs() < 0.5);
        assert!((min_y - (-5.0)).abs() < 0.5);
    }

    #[test]
    fn extends_endpoints_for_square_caps() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 10.0;
        style.cap = StrokeCap::Square;
        let result = stroke_path(&path, &style, Some(0.25));
        let x_values: Vec<f64> = result.data.iter().enumerate()
            .filter(|(i, _)| i % 2 == 0)
            .map(|(_, &v)| v)
            .collect();
        let min_x = x_values.iter().cloned().fold(f64::INFINITY, f64::min);
        let max_x = x_values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        assert!((min_x - (-5.0)).abs() < 0.5);
        assert!((max_x - 105.0).abs() < 0.5);
    }

    #[test]
    fn produces_round_caps_with_more_points_than_butt_caps() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut butt_style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        butt_style.width = 10.0;
        butt_style.cap = StrokeCap::Butt;
        let butt = stroke_path(&path, &butt_style, Some(0.25));
        let mut round_style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        round_style.width = 10.0;
        round_style.cap = StrokeCap::Round;
        let round = stroke_path(&path, &round_style, Some(0.25));
        assert!(round.commands.len() > butt.commands.len());
    }

    #[test]
    fn extends_miter_point_past_symmetric_corner() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 290.0, 410.0);
        append_path_line_to(&mut path, 400.0, 520.0);
        append_path_line_to(&mut path, 510.0, 410.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 30.0;
        style.join = StrokeJoin::Miter;
        style.cap = StrokeCap::Butt;
        style.miter_limit = 6.0;
        let result = stroke_path(&path, &style, Some(0.25));
        let mut apex_hits = 0;
        let mut max_y = f64::NEG_INFINITY;
        let mut i = 0;
        while i < result.data.len() {
            if (result.data[i] - 400.0).abs() < 1e-6 && (result.data[i + 1] - 520.0).abs() < 1e-6 {
                apex_hits += 1;
            }
            if result.data[i + 1] > max_y {
                max_y = result.data[i + 1];
            }
            i += 2;
        }
        assert_eq!(apex_hits, 0);
        assert!((max_y - 541.2).abs() < 1.0);
    }

    #[test]
    fn handles_closed_path_without_adding_caps() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        append_path_close(&mut path);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 4.0;
        let result = stroke_path(&path, &style, Some(0.25));
        assert!(result.commands.contains(&(PathCommand::Close as u8)));
    }

    #[test]
    fn produces_fewer_outline_points_with_coarser_tolerance() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 10.0;
        style.cap = StrokeCap::Round;
        let fine = stroke_path(&path, &style, Some(0.1)).commands.len();
        let coarse = stroke_path(&path, &style, Some(10.0)).commands.len();
        assert!(coarse <= fine);
    }

    #[test]
    fn dashes_produce_multiple_segments_for_simple_on_off_pattern() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 2.0;
        style.dash = vec![10.0, 10.0];
        let result = stroke_path(&path, &style, Some(0.25));
        let move_count = result.commands.iter()
            .filter(|&&c| c == PathCommand::MoveTo as u8)
            .count();
        assert!(move_count >= 2);
    }

    #[test]
    fn dashes_dash_offset_shifts_the_pattern_start_position() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 25.0, 0.0);
        let mut style0 = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style0.width = 2.0;
        style0.dash = vec![20.0, 5.0];
        style0.dash_offset = 0.0;
        let result0 = stroke_path(&path, &style0, Some(0.25));
        let mut style15 = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style15.width = 2.0;
        style15.dash = vec![20.0, 5.0];
        style15.dash_offset = 15.0;
        let result15 = stroke_path(&path, &style15, Some(0.25));
        let moves0 = result0.commands.iter()
            .filter(|&&c| c == PathCommand::MoveTo as u8)
            .count();
        let moves15 = result15.commands.iter()
            .filter(|&&c| c == PathCommand::MoveTo as u8)
            .count();
        assert_eq!(moves0, 1);
        assert_eq!(moves15, 2);
    }

    #[test]
    fn dashes_pattern_wraps_correctly_across_multiple_path_segments() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 25.0, 0.0);
        append_path_line_to(&mut path, 50.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 1.0;
        style.dash = vec![15.0, 5.0];
        let result = stroke_path(&path, &style, Some(0.25));
        let move_count = result.commands.iter()
            .filter(|&&c| c == PathCommand::MoveTo as u8)
            .count();
        assert!(move_count >= 2);
    }

    #[test]
    fn dashes_very_short_segments_produce_correct_number_of_dashes() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 5.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 1.0;
        style.dash = vec![10.0, 10.0];
        let result = stroke_path(&path, &style, Some(0.25));
        let move_count = result.commands.iter()
            .filter(|&&c| c == PathCommand::MoveTo as u8)
            .count();
        assert_eq!(move_count, 1);
    }

    #[test]
    fn dashes_zero_length_dash_entry_is_ignored() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 2.0;
        style.dash = vec![0.0, 10.0, 10.0, 10.0];
        let _result = stroke_path(&path, &style, Some(0.25));
    }

    #[test]
    fn dashes_solid_stroke_with_empty_dash_array_produces_single_outline() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 4.0;
        style.dash = vec![];
        let result = stroke_path(&path, &style, Some(0.25));
        let move_count = result.commands.iter()
            .filter(|&&c| c == PathCommand::MoveTo as u8)
            .count();
        assert_eq!(move_count, 1);
    }

    #[test]
    fn dashes_multiple_subpaths_each_get_dash_pattern_applied() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_move_to(&mut path, 0.0, 20.0);
        append_path_line_to(&mut path, 100.0, 20.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 2.0;
        style.dash = vec![30.0, 10.0];
        let result = stroke_path(&path, &style, Some(0.25));
        let move_count = result.commands.iter()
            .filter(|&&c| c == PathCommand::MoveTo as u8)
            .count();
        assert!(move_count >= 2);
    }

    #[test]
    fn produces_wider_outline_for_larger_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style_thin = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style_thin.width = 2.0;
        let thin = stroke_path(&path, &style_thin, Some(0.25));
        let mut style_thick = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style_thick.width = 20.0;
        let thick = stroke_path(&path, &style_thick, Some(0.25));
        assert!(thick.data.len() >= thin.data.len());
    }
}
