use crate::common::{empty_text_format, format_ref};
use flight_geometry::create_rectangle;
use flight_textlayout::contract::*;

fn create_layout() -> TextLayoutResult {
    let first_format = format_ref(empty_text_format());
    let mut linked = empty_text_format();
    linked.url = Some("https://example.com".to_string());
    let second_format = format_ref(linked);
    let mut first = create_text_layout_group(first_format);
    first.start_index = 0;
    first.end_index = 3;
    first.ascent = 10.0;
    first.descent = 2.0;
    first.height = 12.0;
    first.line_index = 0;
    first.offset_x = 0.0;
    first.offset_y = 2.0;
    first.positions = vec![10.0, 10.0, 10.0];
    first.width = 30.0;
    let mut second = create_text_layout_group(second_format);
    second.start_index = 3;
    second.end_index = 7;
    second.ascent = 10.0;
    second.descent = 2.0;
    second.height = 12.0;
    second.line_index = 1;
    second.offset_x = 0.0;
    second.offset_y = 16.0;
    second.positions = vec![10.0, 10.0, 10.0, 10.0];
    second.width = 40.0;
    let mut layout = create_text_layout_result();
    layout.groups = vec![first, second];
    layout.line_ascents = vec![10.0, 10.0];
    layout.line_descents = vec![2.0, 2.0];
    layout.line_heights = vec![14.0, 14.0];
    layout.line_leadings = vec![0.0, 0.0];
    layout.line_widths = vec![30.0, 40.0];
    layout.num_lines = 2;
    layout.text_height = 28.0;
    layout.text_width = 40.0;
    return layout;
}

mod compute_rich_text_char_index_at_point {
    use super::*;

    #[test]
    fn returns_the_index_at_a_point_within_a_group() {
        assert_eq!(
            compute_rich_text_char_index_at_point(&create_layout(), 25.0, 5.0),
            2
        );
    }

    #[test]
    fn selects_the_closest_line_by_y_distance() {
        assert_eq!(
            compute_rich_text_char_index_at_point(&create_layout(), 5.0, 100.0),
            7
        );
    }
}

mod compute_rich_text_line_metrics {
    use super::*;

    #[test]
    fn returns_metrics_for_a_valid_line() {
        let metrics = compute_rich_text_line_metrics(&create_layout(), 0).unwrap();
        assert_eq!(
            (metrics.ascent, metrics.descent, metrics.width),
            (10.0, 2.0, 30.0)
        );
    }

    #[test]
    fn returns_none_for_a_non_existent_line() {
        assert_eq!(compute_rich_text_line_metrics(&create_layout(), 5), None);
    }
}

mod get_rich_text_char_boundaries {
    use super::*;

    #[test]
    fn fills_out_with_the_bounding_box_of_the_character() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(get_rich_text_char_boundaries(&mut out, &create_layout(), 1));
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (10.0, 2.0, 10.0, 12.0)
        );
    }

    #[test]
    fn returns_false_for_an_out_of_range_index() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(!get_rich_text_char_boundaries(
            &mut out,
            &create_layout(),
            99
        ));
    }
}

mod get_rich_text_first_char_in_paragraph {
    use super::*;

    #[test]
    fn returns_0_at_the_start_of_the_first_paragraph() {
        assert_eq!(get_rich_text_first_char_in_paragraph("hello\nworld", 3), 0);
    }

    #[test]
    fn returns_the_position_after_the_newline_for_a_later_paragraph() {
        assert_eq!(get_rich_text_first_char_in_paragraph("hello\nworld", 8), 6);
    }
}

mod get_rich_text_line_index_at_point {
    use super::*;

    #[test]
    fn returns_0_for_a_y_value_within_the_first_line() {
        assert_eq!(get_rich_text_line_index_at_point(&create_layout(), 5.0), 0);
    }

    #[test]
    fn returns_1_for_a_y_value_within_the_second_line() {
        assert_eq!(get_rich_text_line_index_at_point(&create_layout(), 18.0), 1);
    }
}

mod get_rich_text_line_index_of_char {
    use super::*;

    #[test]
    fn returns_0_for_a_character_on_the_first_line() {
        assert_eq!(get_rich_text_line_index_of_char(&create_layout(), 1), 0);
    }

    #[test]
    fn returns_1_for_a_character_on_the_second_line() {
        assert_eq!(get_rich_text_line_index_of_char(&create_layout(), 5), 1);
    }
}

mod get_rich_text_line_length {
    use super::*;

    #[test]
    fn returns_0_for_a_non_existent_line() {
        assert_eq!(get_rich_text_line_length(&create_layout(), 5), 0);
    }

    #[test]
    fn returns_the_character_count_of_the_requested_line() {
        assert_eq!(get_rich_text_line_length(&create_layout(), 0), 3);
        assert_eq!(get_rich_text_line_length(&create_layout(), 1), 4);
    }
}

mod get_rich_text_line_offset {
    use super::*;

    #[test]
    fn returns_the_start_index_of_the_requested_line() {
        assert_eq!(get_rich_text_line_offset(&create_layout(), 0), 0);
        assert_eq!(get_rich_text_line_offset(&create_layout(), 1), 3);
    }
}

mod get_rich_text_line_text {
    use super::*;

    #[test]
    fn returns_empty_string_for_a_non_existent_line() {
        assert_eq!(get_rich_text_line_text("abcdefg", &create_layout(), 5), "");
    }

    #[test]
    fn returns_the_text_slice_for_the_requested_line() {
        assert_eq!(
            get_rich_text_line_text("abcdefg", &create_layout(), 0),
            "abc"
        );
        assert_eq!(
            get_rich_text_line_text("abcdefg", &create_layout(), 1),
            "defg"
        );
    }
}

mod get_rich_text_link_at_point {
    use super::*;

    #[test]
    fn returns_none_when_the_point_does_not_hit_a_linked_group() {
        assert_eq!(
            get_rich_text_link_at_point(&create_layout(), 10.0, 5.0),
            None
        );
    }

    #[test]
    fn returns_the_url_when_the_point_hits_a_group_with_a_url() {
        assert_eq!(
            get_rich_text_link_at_point(&create_layout(), 10.0, 18.0).as_deref(),
            Some("https://example.com")
        );
    }
}

mod get_rich_text_paragraph_length {
    use super::*;

    #[test]
    fn returns_the_length_including_the_newline() {
        assert_eq!(get_rich_text_paragraph_length("hello\nworld", 3), 6);
    }

    #[test]
    fn returns_to_end_of_string_when_there_is_no_trailing_newline() {
        assert_eq!(get_rich_text_paragraph_length("hello\nworld", 8), 5);
    }
}

mod get_rich_text_selection_rectangles {
    use super::*;

    #[test]
    fn fills_out_with_one_rectangle_per_intersected_group() {
        let mut out = Vec::new();
        get_rich_text_selection_rectangles(&mut out, 1, 5, &create_layout());
        assert_eq!(out.len(), 2);
        assert_eq!((out[0].line_index, out[1].line_index), (0, 1));
    }

    #[test]
    fn returns_empty_for_a_collapsed_selection() {
        let mut out = Vec::new();
        get_rich_text_selection_rectangles(&mut out, 2, 2, &create_layout());
        assert!(out.is_empty());
    }
}
