use super::*;

mod get_bitmap_text_align_string {
    use super::*;

    #[test]
    fn returns_each_canonical_value() {
        assert_eq!(
            get_bitmap_text_align_string(BitmapTextAlign::Center),
            "center"
        );
        assert_eq!(
            get_bitmap_text_align_string(BitmapTextAlign::Justify),
            "justify"
        );
        assert_eq!(get_bitmap_text_align_string(BitmapTextAlign::Left), "left");
        assert_eq!(
            get_bitmap_text_align_string(BitmapTextAlign::Right),
            "right"
        );
    }
}

mod parse_bitmap_text_align {
    use super::*;

    #[test]
    fn parses_only_canonical_values() {
        assert_eq!(
            parse_bitmap_text_align("center"),
            Some(BitmapTextAlign::Center)
        );
        assert_eq!(
            parse_bitmap_text_align("justify"),
            Some(BitmapTextAlign::Justify)
        );
        assert_eq!(parse_bitmap_text_align("left"), Some(BitmapTextAlign::Left));
        assert_eq!(
            parse_bitmap_text_align("right"),
            Some(BitmapTextAlign::Right)
        );
        assert_eq!(parse_bitmap_text_align("LEFT"), None);
    }
}
