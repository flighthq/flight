use flight_tilemap_formats::{format_tiled_color, parse_tiled_color};

mod format_tiled_color {
    use super::*;

    #[test]
    fn formats_black_opaque() {
        assert_eq!(format_tiled_color(0x000000FF), "#ff000000");
    }

    #[test]
    fn formats_white_opaque() {
        assert_eq!(format_tiled_color(0xFFFFFFFF), "#ffffffff");
    }

    #[test]
    fn formats_red_half_alpha() {
        assert_eq!(format_tiled_color(0xFF000080), "#80ff0000");
    }
}

mod parse_tiled_color {
    use super::*;

    #[test]
    fn parses_six_digit_hex() {
        assert_eq!(parse_tiled_color("#112233"), Some(0x112233FF));
    }

    #[test]
    fn parses_eight_digit_hex() {
        assert_eq!(parse_tiled_color("#FF112233"), Some(0x112233FF));
    }

    #[test]
    fn returns_none_for_invalid() {
        assert_eq!(parse_tiled_color("not-a-color"), None);
    }
}
