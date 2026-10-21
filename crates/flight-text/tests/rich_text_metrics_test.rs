use super::*;

mod compute_rich_text_bottom_scroll_v {
    use super::*;

    #[test]
    fn clamps_to_the_total_line_count() {
        let mut data = rich_text_data();
        data.height = 80.0;
        data.scroll_v = 2.0;
        let mut layout = text_layout_result();
        layout.line_heights = vec![10.0, 10.0, 10.0];
        layout.num_lines = 3;
        assert_eq!(compute_rich_text_bottom_scroll_v(&data, &layout), 3.0);
    }

    #[test]
    fn returns_the_last_visible_one_based_line() {
        let mut data = rich_text_data();
        data.height = 34.0;
        data.scroll_v = 2.0;
        let mut layout = text_layout_result();
        layout.line_heights = vec![10.0, 10.0, 10.0, 10.0];
        layout.num_lines = 4;
        assert_eq!(compute_rich_text_bottom_scroll_v(&data, &layout), 4.0);
    }
}

mod compute_rich_text_line_count {
    use super::*;

    #[test]
    fn returns_the_layout_line_count() {
        let mut layout = text_layout_result();
        layout.num_lines = 3;
        assert_eq!(compute_rich_text_line_count(&layout), 3);
    }
}

mod compute_rich_text_max_scroll_h {
    use super::*;

    #[test]
    fn returns_horizontal_overflow_beyond_the_visible_field_width() {
        let mut data = rich_text_data();
        data.width = 54.0;
        let mut layout = text_layout_result();
        layout.text_width = 80.0;
        assert_eq!(compute_rich_text_max_scroll_h(&data, &layout), 30.0);
    }

    #[test]
    fn returns_zero_when_text_fits_horizontally() {
        let mut data = rich_text_data();
        data.width = 100.0;
        let mut layout = text_layout_result();
        layout.text_width = 50.0;
        assert_eq!(compute_rich_text_max_scroll_h(&data, &layout), 0.0);
    }
}

mod compute_rich_text_max_scroll_v {
    use super::*;

    #[test]
    fn returns_one_for_a_single_line() {
        let data = rich_text_data();
        let mut layout = text_layout_result();
        layout.num_lines = 1;
        assert_eq!(compute_rich_text_max_scroll_v(&data, &layout), 1.0);
    }

    #[test]
    fn returns_the_first_scroll_v_where_the_final_line_is_visible() {
        let mut data = rich_text_data();
        data.height = 34.0;
        let mut layout = text_layout_result();
        layout.line_heights = vec![10.0, 10.0, 10.0, 10.0];
        layout.num_lines = 4;
        assert_eq!(compute_rich_text_max_scroll_v(&data, &layout), 2.0);
    }
}

mod compute_rich_text_text_height {
    use super::*;

    #[test]
    fn returns_the_ceil_text_height() {
        let mut layout = text_layout_result();
        layout.text_height = 12.2;
        assert_eq!(compute_rich_text_text_height(&layout), 13.0);
    }
}

mod compute_rich_text_text_width {
    use super::*;

    #[test]
    fn returns_the_ceil_text_width() {
        let mut layout = text_layout_result();
        layout.text_width = 21.1;
        assert_eq!(compute_rich_text_text_width(&layout), 22.0);
    }
}

mod get_rich_text_scroll_y_offset {
    use super::*;

    #[test]
    fn clamps_to_the_available_line_count() {
        assert_eq!(get_rich_text_scroll_y_offset(&[10.0, 12.0], 5), 22.0);
    }

    #[test]
    fn returns_the_sum_of_the_first_n_line_heights() {
        assert_eq!(get_rich_text_scroll_y_offset(&[10.0, 12.0, 14.0], 2), 22.0);
    }

    #[test]
    fn returns_zero_when_first_visible_line_is_zero() {
        assert_eq!(get_rich_text_scroll_y_offset(&[10.0, 12.0, 14.0], 0), 0.0);
    }
}
