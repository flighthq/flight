use flight_scene2d_formats::{SvgColor, parse_svg_color, resolve_svg_color};

mod parse_svg_color {
    use super::*;

    #[test]
    fn reads_hex_rgb_hsl_and_the_named_table_onto_one_value() {
        assert_eq!(
            parse_svg_color("#ff0000"),
            Some(SvgColor {
                alpha: 1.0,
                rgb: 0xff0000,
            })
        );
        assert_eq!(
            parse_svg_color("rgb(0,255,0)"),
            Some(SvgColor {
                alpha: 1.0,
                rgb: 0x00ff00,
            })
        );
        assert_eq!(
            parse_svg_color("hsl(120,100%,50%)"),
            Some(SvgColor {
                alpha: 1.0,
                rgb: 0x00ff00,
            })
        );
        assert_eq!(
            parse_svg_color("red"),
            Some(SvgColor {
                alpha: 1.0,
                rgb: 0xff0000,
            })
        );
    }

    #[test]
    fn answers_none_for_none_and_for_a_colour_it_cannot_read() {
        assert_eq!(parse_svg_color("none"), None);
        assert_eq!(parse_svg_color("nonsense"), None);
    }
}

mod resolve_svg_color {
    use super::*;

    #[test]
    fn defers_current_color_to_the_inherited_colour_and_reads_anything_else_directly() {
        assert_eq!(
            resolve_svg_color("currentColor", "#0000ff"),
            Some(SvgColor {
                alpha: 1.0,
                rgb: 0x0000ff,
            })
        );
        assert_eq!(
            resolve_svg_color("#ff0000", "#0000ff"),
            Some(SvgColor {
                alpha: 1.0,
                rgb: 0xff0000,
            })
        );
    }
}
