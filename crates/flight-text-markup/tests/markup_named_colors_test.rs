use flight_text_markup::contract::*;
use flight_textformat::TextFormat;

use crate::support::*;

fn font_format(registry: &MarkupTagRegistry, color: &str) -> TextFormat {
    let handler = get_markup_tag_handler(registry, "font").expect("font handler");
    return format_of(handler(&attributes(&[("color", color)]), &empty_format()));
}

mod register_markup_named_colors {
    use super::*;

    #[test]
    fn resolves_css_named_font_colors_after_being_registered() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        assert_eq!(font_format(&registry, "red").color, Some(0xff0000ff));
        assert_eq!(
            font_format(&registry, "RebeccaPurple").color,
            Some(0x663399ff)
        );
        assert_eq!(
            font_format(&registry, "cornflowerblue").color,
            Some(0x6495edff)
        );
    }

    #[test]
    fn still_resolves_hex_colors_once_named_colors_are_registered() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        assert_eq!(font_format(&registry, "#f00").color, Some(0xff0000ff));
        assert_eq!(font_format(&registry, "0x00ff00").color, Some(0x00ff00ff));
    }

    #[test]
    fn leaves_an_unknown_color_name_unresolved_rather_than_erroring() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        assert_eq!(font_format(&registry, "notacolor").color, None);
    }

    #[test]
    fn augments_the_color_seam_in_place_without_disturbing_the_font_handler() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        let handler = get_markup_tag_handler(&registry, "font").expect("font handler");
        let format = format_of(handler(
            &attributes(&[("color", "red"), ("size", "24"), ("face", "Arial")]),
            &empty_format(),
        ));
        assert_eq!(format.color, Some(0xff0000ff));
        assert_eq!(format.font.as_deref(), Some("Arial"));
        assert_eq!(format.size, Some(24.0));
    }
}
