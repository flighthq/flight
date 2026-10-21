use std::sync::Arc;

use flight_shape::contract::*;

use crate::support::*;

mod map_scale9_shape_commands {
    use super::*;

    #[test]
    fn maps_coordinates_through_the_mapper() {
        let source = vec![
            ShapeCommandToken::String(String::from("moveTo")),
            ShapeCommandToken::Number(2.0),
            ShapeCommandToken::Number(3.0),
            ShapeCommandToken::Number(7.0),
        ];
        let mapper = ShapeScale9Mapper {
            map_x: Arc::new(|value: f32| value + 1.0),
            map_y: Arc::new(|value: f32| value * 2.0),
        };
        let mut out = Vec::new();
        map_scale9_shape_commands(&mut out, &source, &mapper);
        assert_eq!(out.len(), source.len());
    }
}

mod scale9_commands_source_parity {
    use super::*;

    fn mapper(scale_x: f32, scale_y: f32, offset_x: f32, offset_y: f32) -> ShapeScale9Mapper {
        return ShapeScale9Mapper {
            map_x: Arc::new(move |value: f32| value * scale_x + offset_x),
            map_y: Arc::new(move |value: f32| value * scale_y + offset_y),
        };
    }

    fn map(source: &[ShapeCommandToken], mapper: &ShapeScale9Mapper) -> Vec<ShapeCommandToken> {
        let mut out = Vec::new();
        map_scale9_shape_commands(&mut out, source, mapper);
        return out;
    }

    fn debug(tokens: &[ShapeCommandToken]) -> Vec<String> {
        return tokens.iter().map(|token| format!("{:?}", token)).collect();
    }

    #[test]
    fn passes_style_commands_through_unchanged() {
        let source = vec![
            string("beginFill"),
            number(2.0),
            number(0xff0000ffu32 as f64),
            number(1.0),
        ];
        assert_eq!(
            debug(&map(&source, &mapper(1.0, 1.0, 0.0, 0.0))),
            debug(&source)
        );
    }

    #[test]
    fn remaps_move_to_coordinates() {
        let source = vec![string("moveTo"), number(2.0), number(10.0), number(20.0)];
        assert_eq!(
            debug(&map(&source, &mapper(2.0, 3.0, 0.0, 0.0))),
            debug(&vec![
                string("moveTo"),
                number(2.0),
                number(20.0),
                number(60.0)
            ])
        );
    }

    #[test]
    fn remaps_line_to_coordinates() {
        let source = vec![string("lineTo"), number(2.0), number(100.0), number(50.0)];
        assert_eq!(
            debug(&map(&source, &mapper(1.0, 1.0, 5.0, 10.0))),
            debug(&vec![
                string("lineTo"),
                number(2.0),
                number(105.0),
                number(60.0)
            ])
        );
    }

    #[test]
    fn remaps_draw_rectangle_corners_and_recomputes_size() {
        let source = vec![
            string("drawRectangle"),
            number(4.0),
            number(10.0),
            number(20.0),
            number(50.0),
            number(30.0),
        ];
        assert_eq!(
            debug(&map(&source, &mapper(2.0, 2.0, 0.0, 0.0))),
            debug(&vec![
                string("drawRectangle"),
                number(4.0),
                number(20.0),
                number(40.0),
                number(100.0),
                number(60.0)
            ])
        );
    }

    #[test]
    fn remaps_draw_rounded_rectangle_corners_but_leaves_its_radius_unchanged() {
        let source = vec![
            string("drawRoundedRectangle"),
            number(5.0),
            number(10.0),
            number(20.0),
            number(50.0),
            number(30.0),
            number(20.0),
        ];
        assert_eq!(
            debug(&map(&source, &mapper(2.0, 2.0, 0.0, 0.0))),
            debug(&vec![
                string("drawRoundedRectangle"),
                number(5.0),
                number(20.0),
                number(40.0),
                number(100.0),
                number(60.0),
                number(20.0)
            ])
        );
    }

    #[test]
    fn remaps_draw_circle_center_but_leaves_radius_unchanged() {
        let source = vec![
            string("drawCircle"),
            number(3.0),
            number(50.0),
            number(50.0),
            number(25.0),
        ];
        assert_eq!(
            debug(&map(&source, &mapper(1.0, 1.0, 5.0, 10.0))),
            debug(&vec![
                string("drawCircle"),
                number(3.0),
                number(55.0),
                number(60.0),
                number(25.0)
            ])
        );
    }

    #[test]
    fn remaps_draw_ellipse_extrema_and_recomputes_center_and_radii() {
        let source = vec![
            string("drawEllipse"),
            number(4.0),
            number(50.0),
            number(25.0),
            number(50.0),
            number(25.0),
        ];
        assert_eq!(
            debug(&map(&source, &mapper(2.0, 2.0, 0.0, 0.0))),
            debug(&vec![
                string("drawEllipse"),
                number(4.0),
                number(100.0),
                number(50.0),
                number(100.0),
                number(50.0)
            ])
        );
    }

    #[test]
    fn remaps_quadratic_and_cubic_controls_plus_endpoints() {
        let quadratic = vec![
            string("quadraticCurveTo"),
            number(4.0),
            number(10.0),
            number(20.0),
            number(30.0),
            number(40.0),
        ];
        assert_eq!(
            debug(&map(&quadratic, &mapper(1.0, 1.0, 1.0, 2.0))),
            debug(&vec![
                string("quadraticCurveTo"),
                number(4.0),
                number(11.0),
                number(22.0),
                number(31.0),
                number(42.0)
            ])
        );
        let cubic = vec![
            string("cubicCurveTo"),
            number(6.0),
            number(1.0),
            number(2.0),
            number(3.0),
            number(4.0),
            number(5.0),
            number(6.0),
        ];
        assert_eq!(
            debug(&map(&cubic, &mapper(1.0, 1.0, 1.0, 2.0))),
            debug(&vec![
                string("cubicCurveTo"),
                number(6.0),
                number(2.0),
                number(4.0),
                number(4.0),
                number(6.0),
                number(6.0),
                number(8.0)
            ])
        );
    }

    #[test]
    fn returns_a_buffer_with_the_same_element_count_as_the_input() {
        let source = stream(&[
            ("beginFill", vec![number(0xff0000ffu32 as f64), number(1.0)]),
            (
                "drawRectangle",
                vec![number(0.0), number(0.0), number(100.0), number(100.0)],
            ),
        ]);
        let mapped = map(&source, &mapper(2.0, 2.0, 0.0, 0.0));
        assert_eq!(mapped.len(), source.len());
    }
}
