use flight_node::contract::get_node_local_content_revision;
use flight_path::PathCommand;
use flight_shape::contract::*;

use crate::support::*;

fn cubic_count(shape: &flight_entity::Ref<Shape>) -> usize {
    return keys(shape)
        .iter()
        .filter(|key| *key == "cubicCurveTo")
        .count();
}

mod append_shape_arc {
    use super::*;

    #[test]
    fn emits_a_move_to_followed_by_at_least_one_cubic_curve_to() {
        let shape = shape();
        let pi = std::f64::consts::PI;
        append_shape_arc(&shape, 50.0, 50.0, 25.0, 0.0, pi, None);
        let keys = keys(&shape);
        assert_eq!(keys[0], "moveTo");
        assert!(keys.len() > 1);
        assert!(keys[1..].iter().all(|key| key == "cubicCurveTo"));
    }

    #[test]
    fn arc_start_point_is_on_the_circle_at_start_angle() {
        let shape = shape();
        append_shape_arc(
            &shape,
            0.0,
            0.0,
            10.0,
            0.0,
            std::f64::consts::FRAC_PI_2,
            None,
        );
        assert!((number_at(&shape, 2) - 10.0).abs() < 1e-5);
        assert!((number_at(&shape, 3) - 0.0).abs() < 1e-5);
    }

    #[test]
    fn a_full_circle_uses_four_cubic_segments() {
        let shape = shape();
        append_shape_arc(
            &shape,
            0.0,
            0.0,
            10.0,
            0.0,
            std::f64::consts::PI * 2.0,
            None,
        );
        assert_eq!(cubic_count(&shape), 4);
    }

    #[test]
    fn anticlockwise_arc_sweeps_in_the_negative_direction() {
        let shape = shape();
        append_shape_arc(
            &shape,
            0.0,
            0.0,
            10.0,
            0.0,
            std::f64::consts::FRAC_PI_2,
            Some(true),
        );
        assert_eq!(cubic_count(&shape), 3);
    }
}

mod append_shape_begin_fill {
    use super::*;

    #[test]
    fn pushes_a_begin_fill_command_with_color_and_alpha() {
        let shape = shape();
        append_shape_begin_fill(&shape, 0xff0000ff, Some(0.5));
        expect_commands(
            &shape,
            &[
                string("beginFill"),
                number(2.0),
                number(0xff0000ffu32 as f64),
                number(0.5),
            ],
        );
    }

    #[test]
    fn defaults_alpha_to_1() {
        let shape = shape();
        append_shape_begin_fill(&shape, 0x000000ff, None);
        expect_commands(
            &shape,
            &[
                string("beginFill"),
                number(2.0),
                number(0x000000ffu32 as f64),
                number(1.0),
            ],
        );
    }
}

mod append_shape_begin_gradient_fill {
    use super::*;

    #[test]
    fn pushes_a_begin_gradient_fill_command_with_all_fields() {
        let shape = shape();
        let matrix = matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        append_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &[0xff0000ff, 0x0000ffff],
            &[1.0, 1.0],
            &[0.0, 255.0],
            Some(&matrix),
            Some(SpreadMethod::Reflect),
            Some(InterpolationMethod::LinearRgb),
            Some(0.5),
        );
        expect_commands(
            &shape,
            &[
                string("beginGradientFill"),
                number(8.0),
                string("linear"),
                numbers(&[0xff0000ffu32 as f64, 0x0000ffffu32 as f64]),
                numbers(&[1.0, 1.0]),
                numbers(&[0.0, 255.0]),
                ShapeCommandToken::Matrix(matrix),
                string("reflect"),
                string("linearRGB"),
                number(0.5),
            ],
        );
    }

    #[test]
    fn defaults_matrix_null_spread_pad_interpolation_rgb_and_focal_point_0() {
        let shape = shape();
        append_shape_begin_gradient_fill(
            &shape,
            GradientType::Radial,
            &[0xffffffff],
            &[1.0],
            &[0.0],
            None,
            None,
            None,
            None,
        );
        expect_commands(
            &shape,
            &[
                string("beginGradientFill"),
                number(8.0),
                string("radial"),
                numbers(&[0xffffffffu32 as f64]),
                numbers(&[1.0]),
                numbers(&[0.0]),
                ShapeCommandToken::Null,
                string("pad"),
                string("rgb"),
                number(0.0),
            ],
        );
    }
}

mod append_shape_begin_texture_fill {
    use super::*;

    #[test]
    fn pushes_a_begin_texture_fill_command_with_texture_and_matrix() {
        let shape = shape();
        let texture = texture();
        let matrix = matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        append_shape_begin_texture_fill(&shape, &texture, Some(&matrix));
        let tokens = tokens(&shape);
        assert_eq!(
            format!("{:?}", tokens[0]),
            format!("{:?}", string("beginTextureFill"))
        );
        assert!(std::sync::Arc::ptr_eq(
            token_texture(&tokens[2]).expect("texture"),
            &texture
        ));
        assert!(matches!(&tokens[3], ShapeCommandToken::Matrix(m) if *m == matrix));
    }

    #[test]
    fn defaults_matrix_to_null() {
        let shape = shape();
        append_shape_begin_texture_fill(&shape, &texture(), None);
        assert!(matches!(tokens(&shape)[3], ShapeCommandToken::Null));
    }
}

mod append_shape_circle {
    use super::*;

    #[test]
    fn pushes_a_draw_circle_command_with_position_and_radius() {
        let shape = shape();
        append_shape_circle(&shape, 50.0, 50.0, 25.0);
        expect_commands(
            &shape,
            &[
                string("drawCircle"),
                number(3.0),
                number(50.0),
                number(50.0),
                number(25.0),
            ],
        );
    }
}

mod append_shape_cubic_curve_to {
    use super::*;

    #[test]
    fn pushes_a_cubic_curve_to_command_with_all_points() {
        let shape = shape();
        append_shape_cubic_curve_to(&shape, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0);
        expect_commands(
            &shape,
            &[
                string("cubicCurveTo"),
                number(6.0),
                number(10.0),
                number(20.0),
                number(30.0),
                number(40.0),
                number(50.0),
                number(60.0),
            ],
        );
    }
}

mod append_shape_draw_triangles {
    use super::*;

    #[test]
    fn pushes_a_draw_triangles_command_with_null_indices_and_uvt_and_no_culling() {
        let shape = shape();
        let verts = [0.0, 0.0, 100.0, 0.0, 50.0, 80.0];
        append_shape_draw_triangles(&shape, &verts, None, None, None);
        expect_commands(
            &shape,
            &[
                string("drawTriangles"),
                number(4.0),
                numbers(&verts),
                ShapeCommandToken::Null,
                ShapeCommandToken::Null,
                string("none"),
            ],
        );
    }

    #[test]
    fn pushes_a_draw_triangles_command_with_indices_and_uvt_data() {
        let shape = shape();
        let verts = [0.0, 0.0, 100.0, 0.0, 50.0, 80.0];
        let indices = [0.0, 1.0, 2.0];
        let uvt = [0.0, 0.0, 1.0, 0.0, 0.5, 1.0];
        append_shape_draw_triangles(
            &shape,
            &verts,
            Some(&indices),
            Some(&uvt),
            Some(TriangleCulling::Positive),
        );
        expect_commands(
            &shape,
            &[
                string("drawTriangles"),
                number(4.0),
                numbers(&verts),
                numbers(&indices),
                numbers(&uvt),
                string("positive"),
            ],
        );
    }

    #[test]
    fn accepts_negative_culling() {
        let shape = shape();
        append_shape_draw_triangles(
            &shape,
            &[0.0, 0.0, 100.0, 0.0, 50.0, 80.0],
            None,
            None,
            Some(TriangleCulling::Negative),
        );
        assert_eq!(
            format!("{:?}", tokens(&shape)[5]),
            format!("{:?}", string("negative"))
        );
    }

    #[test]
    fn invalidates_content_on_the_shape() {
        let shape = shape();
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        append_shape_draw_triangles(
            &shape,
            &[0.0, 0.0, 100.0, 0.0, 50.0, 80.0],
            None,
            None,
            None,
        );
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision + 1
        );
    }

    #[test]
    fn works_within_a_begin_fill_end_fill_cycle() {
        let shape = shape();
        append_shape_begin_fill(&shape, 0xff0000ff, Some(1.0));
        append_shape_draw_triangles(
            &shape,
            &[0.0, 0.0, 100.0, 0.0, 50.0, 80.0],
            Some(&[0.0, 1.0, 2.0]),
            None,
            None,
        );
        append_shape_end_fill(&shape);
        assert_eq!(keys(&shape), vec!["beginFill", "drawTriangles", "endFill"]);
    }
}

mod append_shape_ellipse {
    use super::*;

    #[test]
    fn pushes_a_draw_ellipse_command_with_center_and_radii() {
        let shape = shape();
        append_shape_ellipse(&shape, 10.0, 20.0, 100.0, 50.0);
        expect_commands(
            &shape,
            &[
                string("drawEllipse"),
                number(4.0),
                number(10.0),
                number(20.0),
                number(100.0),
                number(50.0),
            ],
        );
    }
}

mod append_shape_elliptical_arc_to {
    use super::*;

    #[test]
    fn emits_cubic_curve_to_commands_for_a_non_degenerate_arc() {
        let shape = shape();
        append_shape_move_to(&shape, 100.0, 0.0);
        append_shape_elliptical_arc_to(&shape, 50.0, 50.0, 0.0, true, false, 100.0, 1.0);
        assert!(keys(&shape).contains(&String::from("cubicCurveTo")));
    }

    #[test]
    fn emits_a_line_to_when_radius_x_is_zero() {
        let shape = shape();
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_elliptical_arc_to(&shape, 0.0, 10.0, 0.0, false, false, 50.0, 50.0);
        assert_eq!(keys(&shape).last().map(String::as_str), Some("lineTo"));
    }

    #[test]
    fn does_nothing_when_start_equals_end() {
        let shape = shape();
        append_shape_move_to(&shape, 10.0, 10.0);
        let before = tokens(&shape).len();
        append_shape_elliptical_arc_to(&shape, 50.0, 50.0, 0.0, false, false, 10.0, 10.0);
        assert_eq!(tokens(&shape).len(), before);
    }
}

mod append_shape_end_fill {
    use super::*;

    #[test]
    fn pushes_an_end_fill_command() {
        let shape = shape();
        append_shape_end_fill(&shape);
        expect_commands(&shape, &[string("endFill"), number(0.0)]);
    }
}

mod append_shape_line_gradient_style {
    use super::*;

    #[test]
    fn pushes_a_line_gradient_style_command_with_all_fields() {
        let shape = shape();
        append_shape_line_gradient_style(
            &shape,
            GradientType::Linear,
            &[0xff0000ff],
            &[1.0],
            &[0.0],
            None,
            None,
            None,
            None,
        );
        expect_commands(
            &shape,
            &[
                string("lineGradientStyle"),
                number(8.0),
                string("linear"),
                numbers(&[0xff0000ffu32 as f64]),
                numbers(&[1.0]),
                numbers(&[0.0]),
                ShapeCommandToken::Null,
                string("pad"),
                string("rgb"),
                number(0.0),
            ],
        );
    }
}

mod append_shape_line_style {
    use super::*;

    #[test]
    fn pushes_a_line_style_command_with_all_parameters() {
        let shape = shape();
        append_shape_line_style(
            &shape,
            Some(2.0),
            0x0000ffff,
            Some(0.8),
            Some(true),
            Some(LineScaleMode::Horizontal),
            Some(CapsStyle::Round),
            Some(JointStyle::Bevel),
            Some(5.0),
        );
        expect_commands(
            &shape,
            &[
                string("lineStyle"),
                number(8.0),
                number(2.0),
                number(0x0000ffffu32 as f64),
                number(0.8),
                ShapeCommandToken::Boolean(true),
                string("horizontal"),
                string("round"),
                string("bevel"),
                number(5.0),
            ],
        );
    }

    #[test]
    fn defaults_thickness_alpha_hinting_scale_caps_joints_and_miter_limit() {
        let shape = shape();
        append_shape_line_style(&shape, None, 0x000000ff, None, None, None, None, None, None);
        expect_commands(
            &shape,
            &[
                string("lineStyle"),
                number(8.0),
                number(1.0),
                number(0x000000ffu32 as f64),
                number(1.0),
                ShapeCommandToken::Boolean(false),
                string("normal"),
                string("none"),
                string("round"),
                number(3.0),
            ],
        );
    }
}

mod append_shape_line_texture_style {
    use super::*;

    #[test]
    fn pushes_a_line_texture_style_command_with_texture_and_matrix() {
        let shape = shape();
        let texture = texture();
        let matrix = matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        append_shape_line_texture_style(&shape, &texture, Some(&matrix));
        let tokens = tokens(&shape);
        assert_eq!(
            format!("{:?}", tokens[0]),
            format!("{:?}", string("lineTextureStyle"))
        );
        assert!(std::sync::Arc::ptr_eq(
            token_texture(&tokens[2]).expect("texture"),
            &texture
        ));
        assert!(matches!(&tokens[3], ShapeCommandToken::Matrix(m) if *m == matrix));
    }

    #[test]
    fn defaults_matrix_to_null() {
        let shape = shape();
        append_shape_line_texture_style(&shape, &texture(), None);
        assert!(matches!(tokens(&shape)[3], ShapeCommandToken::Null));
    }
}

mod append_shape_line_to {
    use super::*;

    #[test]
    fn pushes_a_line_to_command_with_position() {
        let shape = shape();
        append_shape_line_to(&shape, 100.0, 200.0);
        expect_commands(
            &shape,
            &[string("lineTo"), number(2.0), number(100.0), number(200.0)],
        );
    }
}

mod append_shape_move_to {
    use super::*;

    #[test]
    fn pushes_a_move_to_command_with_position() {
        let shape = shape();
        append_shape_move_to(&shape, 10.0, 20.0);
        expect_commands(
            &shape,
            &[string("moveTo"), number(2.0), number(10.0), number(20.0)],
        );
    }
}

mod append_shape_path {
    use super::*;

    #[test]
    fn pushes_a_draw_path_command_with_commands_data_and_winding() {
        let shape = shape();
        append_shape_path(
            &shape,
            &[PathCommand::MoveTo as u8, PathCommand::LineTo as u8],
            &[0.0, 0.0, 100.0, 100.0],
            Some(flight_path::PathWinding::NonZero),
        );
        expect_commands(
            &shape,
            &[
                string("drawPath"),
                number(3.0),
                numbers(&[1.0, 2.0]),
                numbers(&[0.0, 0.0, 100.0, 100.0]),
                string("nonZero"),
            ],
        );
    }

    #[test]
    fn defaults_winding_to_even_odd() {
        let shape = shape();
        append_shape_path(&shape, &[], &[], None);
        expect_commands(
            &shape,
            &[
                string("drawPath"),
                number(3.0),
                numbers(&[]),
                numbers(&[]),
                string("evenOdd"),
            ],
        );
    }

    #[test]
    fn accepts_cubic_curve_to_commands_in_the_path() {
        let shape = shape();
        append_shape_path(
            &shape,
            &[PathCommand::MoveTo as u8, PathCommand::CubicCurveTo as u8],
            &[0.0, 0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0],
            None,
        );
        let tokens = tokens(&shape);
        assert_eq!(
            format!("{:?}", tokens[4]),
            format!("{:?}", string("evenOdd"))
        );
        assert!(matches!(&tokens[2], ShapeCommandToken::Numbers(n) if n.values == vec![1.0, 6.0]));
    }

    #[test]
    fn invalidates_content_on_the_shape() {
        let shape = shape();
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        append_shape_path(&shape, &[PathCommand::MoveTo as u8], &[10.0, 20.0], None);
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision + 1
        );
    }

    #[test]
    fn works_within_a_begin_fill_end_fill_cycle() {
        let shape = shape();
        append_shape_begin_fill(&shape, 0x00ff00ff, Some(1.0));
        append_shape_path(
            &shape,
            &[PathCommand::MoveTo as u8, PathCommand::LineTo as u8],
            &[0.0, 0.0, 100.0, 100.0],
            None,
        );
        append_shape_end_fill(&shape);
        assert_eq!(keys(&shape), vec!["beginFill", "drawPath", "endFill"]);
    }
}

mod append_shape_polygon {
    use super::*;

    #[test]
    fn emits_move_to_line_to_commands_and_closes_back_to_the_first_vertex() {
        let shape = shape();
        append_shape_polygon(&shape, &[0.0, 0.0, 100.0, 0.0, 50.0, 80.0]);
        assert_eq!(keys(&shape), vec!["moveTo", "lineTo", "lineTo", "lineTo"]);
        let tokens = tokens(&shape);
        let last = tokens.len();
        assert_eq!(number_at(&shape, last - 2), 0.0);
        assert_eq!(number_at(&shape, last - 1), 0.0);
    }

    #[test]
    fn emits_nothing_for_fewer_than_two_points() {
        let shape = shape();
        append_shape_polygon(&shape, &[0.0, 0.0]);
        assert!(tokens(&shape).is_empty());
    }
}

mod append_shape_polyline {
    use super::*;

    #[test]
    fn emits_move_to_line_to_commands_without_closing() {
        let shape = shape();
        append_shape_polyline(&shape, &[0.0, 0.0, 50.0, 50.0, 100.0, 0.0]);
        assert_eq!(keys(&shape), vec!["moveTo", "lineTo", "lineTo"]);
    }

    #[test]
    fn emits_nothing_for_fewer_than_two_points() {
        let shape = shape();
        append_shape_polyline(&shape, &[0.0, 0.0]);
        assert!(tokens(&shape).is_empty());
    }
}

mod append_shape_quadratic_curve_to {
    use super::*;

    #[test]
    fn pushes_a_quadratic_curve_to_command_with_control_and_anchor_points() {
        let shape = shape();
        append_shape_quadratic_curve_to(&shape, 10.0, 20.0, 30.0, 40.0);
        expect_commands(
            &shape,
            &[
                string("quadraticCurveTo"),
                number(4.0),
                number(10.0),
                number(20.0),
                number(30.0),
                number(40.0),
            ],
        );
    }
}

mod append_shape_rectangle {
    use super::*;

    #[test]
    fn pushes_a_draw_rectangle_command_with_position_and_dimensions() {
        let shape = shape();
        append_shape_rectangle(&shape, 10.0, 20.0, 100.0, 50.0);
        expect_commands(
            &shape,
            &[
                string("drawRectangle"),
                number(4.0),
                number(10.0),
                number(20.0),
                number(100.0),
                number(50.0),
            ],
        );
    }
}

mod append_shape_rounded_rectangle {
    use super::*;

    #[test]
    fn pushes_a_draw_rounded_rectangle_command() {
        let shape = shape();
        append_shape_rounded_rectangle(&shape, 0.0, 0.0, 100.0, 50.0, 20.0);
        expect_commands(
            &shape,
            &[
                string("drawRoundedRectangle"),
                number(5.0),
                number(0.0),
                number(0.0),
                number(100.0),
                number(50.0),
                number(20.0),
            ],
        );
    }
}

mod append_shape_rounded_rectangle_with_corner_radii {
    use super::*;

    #[test]
    fn expands_clockwise_in_top_left_top_right_bottom_right_bottom_left_order() {
        let shape = shape();
        append_shape_rounded_rectangle_with_corner_radii(
            &shape, 0.0, 0.0, 100.0, 100.0, 10.0, 20.0, 30.0, 40.0,
        );
        let tokens = tokens(&shape);
        assert_eq!(
            format!("{:?}", tokens[0]),
            format!("{:?}", string("moveTo"))
        );
        let pairs = [
            (2, 10.0, 0.0),
            (6, 80.0, 0.0),
            (14, 100.0, 20.0),
            (18, 100.0, 70.0),
            (26, 70.0, 100.0),
            (30, 40.0, 100.0),
            (38, 0.0, 60.0),
            (42, 0.0, 10.0),
            (50, 10.0, 0.0),
        ];
        for (index, x, y) in pairs {
            assert_eq!(number_at(&shape, index), x, "x at {}", index);
            assert_eq!(number_at(&shape, index + 1), y, "y at {}", index);
        }
    }
}

mod append_shape_tangent_arc_to {
    use super::*;

    fn last_pen(shape: &flight_entity::Ref<Shape>) -> (f64, f64) {
        let tokens = tokens(shape);
        let mut x = 0.0;
        let mut y = 0.0;
        let mut index = 0;
        while index + 1 < tokens.len() {
            let ShapeCommandToken::String(key) = &tokens[index] else {
                break;
            };
            let ShapeCommandToken::Number(arg_count) = &tokens[index + 1] else {
                break;
            };
            let base = index + 2;
            match key.as_str() {
                "moveTo" | "lineTo" => {
                    x = number_at(shape, base);
                    y = number_at(shape, base + 1);
                }
                "quadraticCurveTo" => {
                    x = number_at(shape, base + 2);
                    y = number_at(shape, base + 3);
                }
                "cubicCurveTo" => {
                    x = number_at(shape, base + 4);
                    y = number_at(shape, base + 5);
                }
                _ => {}
            }
            index = base + *arg_count as usize;
        }
        return (x, y);
    }

    #[test]
    fn emits_a_line_to_followed_by_cubic_curve_to_commands_for_a_right_angle() {
        let shape = shape();
        append_shape_move_to(&shape, 100.0, 0.0);
        append_shape_tangent_arc_to(&shape, 100.0, 100.0, 0.0, 100.0, 20.0);
        let keys = keys(&shape);
        assert_eq!(keys[0], "moveTo");
        assert_eq!(keys[1], "lineTo");
        assert!(keys[2..].iter().all(|key| key == "cubicCurveTo"));
    }

    #[test]
    fn selects_the_short_quarter_turn_sweep_for_a_clockwise_right_angle() {
        let shape = shape();
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_tangent_arc_to(&shape, 100.0, 0.0, 100.0, 100.0, 20.0);
        let (x, y) = last_pen(&shape);
        assert!((x - 100.0).abs() < 1e-6);
        assert!((y - 20.0).abs() < 1e-6);
    }

    #[test]
    fn selects_the_short_quarter_turn_sweep_for_a_counterclockwise_right_angle() {
        let shape = shape();
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_tangent_arc_to(&shape, 0.0, 100.0, 100.0, 100.0, 20.0);
        let (x, y) = last_pen(&shape);
        assert!((x - 20.0).abs() < 1e-6);
        assert!((y - 100.0).abs() < 1e-6);
    }

    #[test]
    fn falls_back_to_a_line_to_when_the_tangent_has_zero_length() {
        let shape = shape();
        append_shape_move_to(&shape, 100.0, 100.0);
        append_shape_tangent_arc_to(&shape, 100.0, 100.0, 200.0, 100.0, 10.0);
        assert!(
            keys(&shape)
                .iter()
                .all(|key| key == "moveTo" || key == "lineTo")
        );
    }

    #[test]
    fn falls_back_to_a_line_to_when_tangent_lines_are_collinear() {
        let shape = shape();
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_tangent_arc_to(&shape, 50.0, 0.0, 100.0, 0.0, 20.0);
        assert!(
            keys(&shape)
                .iter()
                .all(|key| key == "moveTo" || key == "lineTo")
        );
    }

    #[test]
    fn falls_back_to_a_line_to_when_radius_is_zero_or_negative() {
        let shape = shape();
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_tangent_arc_to(&shape, 100.0, 0.0, 100.0, 100.0, 0.0);
        assert!(
            keys(&shape)
                .iter()
                .all(|key| key == "moveTo" || key == "lineTo")
        );
    }
}

mod path_command {
    use super::*;

    #[test]
    fn has_expected_numeric_values() {
        assert_eq!(PathCommand::NoOp as u8, 0);
        assert_eq!(PathCommand::MoveTo as u8, 1);
        assert_eq!(PathCommand::LineTo as u8, 2);
        assert_eq!(PathCommand::QuadraticCurveTo as u8, 3);
        assert_eq!(PathCommand::WideMoveTo as u8, 4);
        assert_eq!(PathCommand::WideLineTo as u8, 5);
        assert_eq!(PathCommand::CubicCurveTo as u8, 6);
    }
}

mod path_command_bridge {
    use super::*;

    #[test]
    fn bridges_a_rectangle_path_from_canonical_path_command_constants() {
        let shape = shape();
        let cmds = [
            PathCommand::MoveTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
            PathCommand::LineTo as u8,
        ];
        let data = [0.0, 0.0, 100.0, 0.0, 100.0, 50.0, 0.0, 50.0, 0.0, 0.0];
        append_shape_path(
            &shape,
            &cmds,
            &data,
            Some(flight_path::PathWinding::NonZero),
        );
        let tokens = tokens(&shape);
        assert!(
            matches!(&tokens[2], ShapeCommandToken::Numbers(n) if n.values == vec![1.0, 2.0, 2.0, 2.0, 2.0])
        );
        assert!(matches!(&tokens[3], ShapeCommandToken::Numbers(n) if n.values == data));
        assert_eq!(
            format!("{:?}", tokens[4]),
            format!("{:?}", string("nonZero"))
        );
    }
}
