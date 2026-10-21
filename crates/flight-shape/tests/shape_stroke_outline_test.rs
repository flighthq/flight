use flight_shape::contract::*;

use crate::support::*;

mod get_shape_stroke_outline_regions {
    use super::*;

    #[test]
    fn returns_none_for_a_non_solid_stroke() {
        let commands = stream(&[("lineTextureStyle", vec![null_token()])]);
        assert!(get_shape_stroke_outline_regions(&commands).is_none());
    }

    #[test]
    fn returns_no_outline_for_an_empty_stream() {
        let regions = get_shape_stroke_outline_regions(&[]).expect("solid");
        assert!(regions.is_empty());
    }
}

mod stroke_outline_source_parity {
    use super::*;

    #[test]
    fn converts_a_solid_open_stroke_into_a_fill_region_with_matching_color_and_alpha() {
        let shape = shape();
        append_shape_line_style(
            &shape,
            Some(8.0),
            0x123456ff,
            Some(0.5),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::Square),
            Some(JointStyle::Bevel),
            Some(4.0),
        );
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 20.0, 0.0);
        let regions = get_shape_stroke_outline_regions(&tokens(&shape)).expect("solid");
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].alpha, 0.5);
        assert_eq!(regions[0].color, 0x123456ff);
        assert!(!regions[0].path.read().unwrap().commands.is_empty());
    }

    #[test]
    fn converts_an_open_elliptical_arc_into_a_fill_outline() {
        let shape = shape();
        append_shape_line_style(
            &shape,
            Some(8.0),
            0x123456ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_elliptical_arc_to(&shape, 50.0, 25.0, 0.0, false, true, 100.0, 0.0);
        let regions = get_shape_stroke_outline_regions(&tokens(&shape)).expect("solid");
        assert_eq!(regions.len(), 1);
        assert!(!regions[0].path.read().unwrap().commands.is_empty());
    }

    #[test]
    fn defers_closed_and_non_solid_strokes_to_the_renderer_fallback() {
        let closed = shape();
        append_shape_line_style(
            &closed,
            Some(8.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_rectangle(&closed, 0.0, 0.0, 20.0, 10.0);
        assert!(get_shape_stroke_outline_regions(&tokens(&closed)).is_none());
        let gradient = vec![string("lineGradientStyle"), number(1.0), number(0.0)];
        assert!(get_shape_stroke_outline_regions(&gradient).is_none());
    }
}
