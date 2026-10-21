use flight_geometry::create_rectangle;
use flight_textlayout::contract::*;

fn create_layout(text_height: f32, text_width: f32) -> TextLayoutResult {
    let mut layout = create_text_layout_result();
    layout.num_lines = 1;
    layout.text_height = text_height;
    layout.text_width = text_width;
    return layout;
}

fn create_spec(
    auto_size: TextAutoSize,
    height: f32,
    width: f32,
    word_wrap: bool,
) -> TextBoundsSpec {
    return TextBoundsSpec {
        auto_size,
        height,
        width,
        word_wrap: Some(word_wrap),
    };
}

mod compute_text_bounds_height {
    use super::*;

    #[test]
    fn uses_spec_height_when_auto_size_is_none() {
        assert_eq!(
            compute_text_bounds_height(
                &create_spec(TextAutoSize::None, 80.0, 200.0, false),
                &create_layout(20.0, 50.0),
            ),
            80.0
        );
    }

    #[test]
    fn uses_text_height_plus_gutters_when_auto_size_is_enabled() {
        assert_eq!(
            compute_text_bounds_height(
                &create_spec(TextAutoSize::Left, 100.0, 200.0, false),
                &create_layout(18.0, 50.0),
            ),
            22.0
        );
    }
}

mod compute_text_bounds_offset_x {
    use super::*;

    #[test]
    fn returns_zero_for_left_and_none_anchoring() {
        assert_eq!(
            compute_text_bounds_offset_x(
                &create_spec(TextAutoSize::Left, 100.0, 120.0, false),
                &create_layout(20.0, 30.0),
            ),
            0.0
        );
    }

    #[test]
    fn shifts_the_box_fully_into_the_slack_for_right_anchoring() {
        assert_eq!(
            compute_text_bounds_offset_x(
                &create_spec(TextAutoSize::Right, 100.0, 120.0, false),
                &create_layout(20.0, 30.0),
            ),
            86.0
        );
    }

    #[test]
    fn splits_the_slack_for_center_anchoring() {
        assert_eq!(
            compute_text_bounds_offset_x(
                &create_spec(TextAutoSize::Center, 100.0, 120.0, false),
                &create_layout(20.0, 30.0),
            ),
            43.0
        );
    }
}

mod compute_text_bounds_rectangle {
    use super::*;

    #[test]
    fn fills_the_declared_box_at_the_origin_when_auto_size_is_none() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_text_bounds_rectangle(
            &mut out,
            &create_spec(TextAutoSize::None, 80.0, 120.0, false),
            &create_layout(20.0, 50.0),
        );
        assert_eq!(
            (out.height, out.width, out.x, out.y),
            (80.0, 120.0, 0.0, 0.0)
        );
    }

    #[test]
    fn fills_the_measured_box_with_the_anchor_offset_under_auto_size() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_text_bounds_rectangle(
            &mut out,
            &create_spec(TextAutoSize::Right, 100.0, 120.0, false),
            &create_layout(18.0, 30.0),
        );
        assert_eq!(
            (out.height, out.width, out.x, out.y),
            (22.0, 34.0, 86.0, 0.0)
        );
    }
}

mod compute_text_bounds_width {
    use super::*;

    #[test]
    fn uses_spec_width_when_auto_size_is_none() {
        assert_eq!(
            compute_text_bounds_width(
                &create_spec(TextAutoSize::None, 100.0, 120.0, false),
                &create_layout(20.0, 50.0),
            ),
            120.0
        );
    }

    #[test]
    fn uses_spec_width_when_word_wrap_is_enabled() {
        assert_eq!(
            compute_text_bounds_width(
                &create_spec(TextAutoSize::Left, 100.0, 120.0, true),
                &create_layout(20.0, 50.0),
            ),
            120.0
        );
    }

    #[test]
    fn uses_text_width_plus_gutters_when_auto_size_is_enabled() {
        assert_eq!(
            compute_text_bounds_width(
                &create_spec(TextAutoSize::Left, 100.0, 200.0, false),
                &create_layout(20.0, 30.0),
            ),
            34.0
        );
    }
}

mod text_bounds_gutter {
    use super::*;

    #[test]
    fn equals_text_layout_gutter() {
        assert_eq!(TEXT_BOUNDS_GUTTER, TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn is_a_positive_number() {
        assert!(std::hint::black_box(TEXT_BOUNDS_GUTTER) > 0.0);
    }
}
