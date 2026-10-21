use flight_shape::contract::*;

use crate::support::*;

mod get_shape_stroke_regions {
    use super::*;

    #[test]
    fn resolves_a_solid_stroke_span() {
        let commands = stream(&[
            (
                "lineStyle",
                vec![
                    number(2.0),
                    number(0x112233ffu32 as f64),
                    number(1.0),
                    string("normal"),
                    string("round"),
                    string("miter"),
                    number(4.0),
                ],
            ),
            ("moveTo", vec![number(0.0), number(0.0)]),
            ("lineTo", vec![number(4.0), number(0.0)]),
        ]);
        let regions = get_shape_stroke_regions(&commands).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].style.width, 2.0);
    }
}

mod has_non_solid_shape_stroke {
    use super::*;

    #[test]
    fn detects_texture_line_styles() {
        let commands = stream(&[("lineTextureStyle", vec![null_token()])]);
        assert!(has_non_solid_shape_stroke(&commands));
        assert!(!has_non_solid_shape_stroke(&stream(&[(
            "lineStyle",
            vec![number(1.0)]
        )])));
    }
}

mod stroke_source_parity {
    use super::*;
    use flight_path::{PathCommand, StrokeJoin, tessellate_stroke_path};

    fn stroked_corner(join: JointStyle, thickness: f64) -> Option<Vec<ShapeStrokeRegion>> {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(thickness),
            0x112233ff,
            Some(0.5),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(join),
            Some(6.0),
        );
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 100.0, 0.0);
        append_shape_line_to(&shape, 100.0, 100.0);
        return get_shape_stroke_regions(&tokens(&shape));
    }

    #[test]
    fn resolves_a_solid_stroke_span_into_one_styled_centerline_with_color_and_alpha() {
        let regions = stroked_corner(JointStyle::Miter, 20.0).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].color, 0x112233ff);
        assert_eq!(regions[0].alpha, 0.5);
        assert_eq!(regions[0].style.width, 20.0);
        assert_eq!(regions[0].style.join, StrokeJoin::Miter);
        assert_eq!(regions[0].style.cap, flight_path::StrokeCap::Butt);
        let path = regions[0].path.read().unwrap();
        assert!(!path.commands.is_empty());
        assert_eq!(path.commands[0], PathCommand::MoveTo as u8);
    }

    #[test]
    fn resolves_elliptical_and_tangent_arcs_into_the_stroked_centerline() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(8.0),
            0x112233ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_elliptical_arc_to(&shape, 50.0, 25.0, 0.0, false, true, 100.0, 0.0);
        append_shape_tangent_arc_to(&shape, 150.0, 0.0, 150.0, 50.0, 10.0);
        let regions = get_shape_stroke_regions(&tokens(&shape)).expect("solid");
        let path = regions[0].path.read().unwrap();
        assert!(
            path.commands
                .iter()
                .filter(|verb| **verb == PathCommand::CubicCurveTo as u8)
                .count()
                >= 3
        );
        let len = path.data.len();
        assert!((path.data[len - 2] - 150.0).abs() < 1e-4);
        assert!((path.data[len - 1] - 10.0).abs() < 1e-4);
    }

    #[test]
    fn carries_a_tangent_arc_endpoint_across_a_later_stroke_style_boundary() {
        let shape = registered_shape(None);
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_tangent_arc_to(&shape, 100.0, 0.0, 100.0, 100.0, 20.0);
        append_shape_line_style(
            &shape,
            Some(8.0),
            0x112233ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_line_to(&shape, 100.0, 50.0);
        let regions = get_shape_stroke_regions(&tokens(&shape)).expect("solid");
        let path = regions[0].path.read().unwrap();
        assert!((path.data[0] - 100.0).abs() < 1e-4);
        assert!((path.data[1] - 20.0).abs() < 1e-4);
    }

    #[test]
    fn preserves_miter_bevel_and_round_styles_for_the_shared_tessellator() {
        assert_eq!(
            stroked_corner(JointStyle::Miter, 20.0).expect("miter")[0]
                .style
                .join,
            StrokeJoin::Miter
        );
        assert_eq!(
            stroked_corner(JointStyle::Bevel, 20.0).expect("bevel")[0]
                .style
                .join,
            StrokeJoin::Bevel
        );
        assert_eq!(
            stroked_corner(JointStyle::Round, 20.0).expect("round")[0]
                .style
                .join,
            StrokeJoin::Round
        );
    }

    #[test]
    fn emits_no_region_for_a_cleared_stroke_and_for_a_stroke_free_shape() {
        let cleared = registered_shape(None);
        append_shape_line_style(
            &cleared,
            Some(0.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_move_to(&cleared, 0.0, 0.0);
        append_shape_line_to(&cleared, 50.0, 0.0);
        let regions = get_shape_stroke_regions(&tokens(&cleared)).expect("solid");
        assert!(regions.is_empty());
        let stroke_free = registered_shape(None);
        append_shape_move_to(&stroke_free, 0.0, 0.0);
        append_shape_line_to(&stroke_free, 50.0, 0.0);
        let regions = get_shape_stroke_regions(&tokens(&stroke_free)).expect("solid");
        assert!(regions.is_empty());
    }

    #[test]
    fn closes_each_span_and_restrokes_on_a_new_line_style() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(10.0),
            0xff0000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(6.0),
        );
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 50.0, 0.0);
        append_shape_line_style(
            &shape,
            Some(4.0),
            0x00ff00ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::Round),
            Some(JointStyle::Round),
            Some(6.0),
        );
        append_shape_move_to(&shape, 0.0, 20.0);
        append_shape_line_to(&shape, 50.0, 20.0);
        let regions = get_shape_stroke_regions(&tokens(&shape)).expect("solid");
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].color, 0xff0000ff);
        assert_eq!(regions[1].color, 0x00ff00ff);
    }

    #[test]
    fn tessellates_an_open_styled_centerline_into_a_non_empty_mesh() {
        let region = stroked_corner(JointStyle::Miter, 20.0).expect("solid")[0].clone();
        let path = region.path.read().unwrap();
        let mesh = tessellate_stroke_path(&path, &region.style, None).expect("mesh");
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn resolves_and_tessellates_a_closed_rectangle_as_a_hollow_ring() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(8.0),
            0xff0000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(4.0),
        );
        append_shape_rectangle(&shape, 10.0, 10.0, 100.0, 50.0);
        let region = get_shape_stroke_regions(&tokens(&shape)).expect("solid")[0].clone();
        let path = region.path.read().unwrap();
        assert!(tessellate_stroke_path(&path, &region.style, None).is_some());
    }

    #[test]
    fn resolves_a_stroked_draw_path_carrying_a_close_verb() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(6.0),
            0x0000ffff,
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
            &[0.0, 0.0, 40.0, 0.0, 20.0, 30.0],
            None,
        );
        let region = get_shape_stroke_regions(&tokens(&shape)).expect("solid")[0].clone();
        let path = region.path.read().unwrap();
        assert!(tessellate_stroke_path(&path, &region.style, None).is_some());
    }

    #[test]
    fn resolves_a_stroked_return_to_start_polygon_without_a_close_verb() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(6.0),
            0x0000ffff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(4.0),
        );
        append_shape_polygon(&shape, &[0.0, 0.0, 50.0, 0.0, 25.0, 40.0]);
        let region = get_shape_stroke_regions(&tokens(&shape)).expect("solid")[0].clone();
        let path = region.path.read().unwrap();
        assert!(tessellate_stroke_path(&path, &region.style, None).is_some());
    }

    #[test]
    fn keeps_a_pathological_centerline_as_a_region_for_renderer_fallback() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(6.0),
            0x0000ffff,
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
                PathCommand::LineTo as u8,
                PathCommand::Close as u8,
            ],
            &[0.0, 0.0, 40.0, 40.0, 0.0, 40.0, 40.0, 0.0],
            None,
        );
        let region = get_shape_stroke_regions(&tokens(&shape)).expect("solid")[0].clone();
        let path = region.path.read().unwrap();
        assert!(tessellate_stroke_path(&path, &region.style, None).is_none());
    }

    #[test]
    fn ignores_an_unstroked_closed_primitive_and_still_strokes_a_later_open_line() {
        let shape = registered_shape(None);
        append_shape_rectangle(&shape, 0.0, 0.0, 100.0, 50.0);
        append_shape_line_style(
            &shape,
            Some(6.0),
            0xff0000ff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(4.0),
        );
        append_shape_move_to(&shape, 10.0, 80.0);
        append_shape_line_to(&shape, 90.0, 80.0);
        let regions = get_shape_stroke_regions(&tokens(&shape)).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].color, 0xff0000ff);
    }

    #[test]
    fn defers_a_gradient_or_bitmap_stroke_to_the_raster_path() {
        let gradient = vec![
            string("lineGradientStyle"),
            number(1.0),
            number(0.0),
            string("moveTo"),
            number(2.0),
            number(0.0),
            number(0.0),
            string("lineTo"),
            number(2.0),
            number(50.0),
            number(0.0),
        ];
        assert!(get_shape_stroke_regions(&gradient).is_none());
    }

    #[test]
    fn non_solid_stroke_is_true_only_for_gradient_or_bitmap_strokes() {
        let solid = registered_shape(None);
        append_shape_line_style(
            &solid,
            Some(3.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(!has_non_solid_shape_stroke(&tokens(&solid)));
        assert!(has_non_solid_shape_stroke(&[
            string("lineGradientStyle"),
            number(1.0),
            number(0.0)
        ]));
        assert!(has_non_solid_shape_stroke(&[
            string("lineTextureStyle"),
            number(1.0),
            number(0.0)
        ]));
    }
}
