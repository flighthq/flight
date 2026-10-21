use flight_textlayout::contract::*;

mod create_text_metrics {
    use super::*;

    #[test]
    fn creates_a_zeroed_metrics_object() {
        let metrics = create_text_metrics();
        assert_eq!(
            (metrics.height, metrics.num_lines, metrics.width),
            (0.0, 0, 0.0)
        );
    }
}

mod get_text_metrics {
    use super::*;

    #[test]
    fn fills_the_measured_content_size_from_a_layout_ceiling_fractional_extents() {
        let mut out = create_text_metrics();
        let mut layout = create_text_layout_result();
        layout.num_lines = 2;
        layout.text_height = 8.7;
        layout.text_width = 12.2;
        get_text_metrics(&mut out, &layout);
        assert_eq!((out.width, out.height, out.num_lines), (13.0, 9.0, 2));
    }
}

mod initialize_text_metrics {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_metrics() {
        let mut out = create_text_metrics();
        out.height = 4.0;
        out.num_lines = 5;
        out.width = 6.0;
        initialize_text_metrics(&mut out);
        assert_eq!((out.height, out.num_lines, out.width), (0.0, 0, 0.0));
    }
}
