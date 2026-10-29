//! flight-compiler: target-native

use flight_text_markup::contract::*;

use crate::support::*;

mod register_markup_named_colors {
    use super::*;

    #[test]
    fn resolves_css_named_font_colors_after_being_registered() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        let red = parse_with("<font color=\"red\">x</font>", &registry);
        assert_eq!(format_at(&red, 0).color, Some(0xff0000ff));
        let rebecca = parse_with("<font color=\"RebeccaPurple\">x</font>", &registry);
        assert_eq!(format_at(&rebecca, 0).color, Some(0x663399ff));
        let cornflower = parse_with("<font color=\"cornflowerblue\">x</font>", &registry);
        assert_eq!(format_at(&cornflower, 0).color, Some(0x6495edff));
    }

    #[test]
    fn still_resolves_hex_colors_once_named_colors_are_registered() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        let short = parse_with("<font color=\"#f00\">x</font>", &registry);
        assert_eq!(format_at(&short, 0).color, Some(0xff0000ff));
        let long = parse_with("<font color=\"0x00ff00\">x</font>", &registry);
        assert_eq!(format_at(&long, 0).color, Some(0x00ff00ff));
    }

    #[test]
    fn leaves_an_unknown_color_name_unresolved_rather_than_erroring() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        let parsed = parse_with("<font color=\"notacolor\">x</font>", &registry);
        assert_eq!(format_at(&parsed, 0).color, None);
    }

    #[test]
    fn augments_the_color_seam_in_place_without_disturbing_the_font_handler() {
        let mut registry = standard_registry();
        register_markup_named_colors(&mut registry);
        let parsed = parse_with(
            "<font color=\"red\" size=\"24\" face=\"Arial\">x</font>",
            &registry,
        );
        let format = format_at(&parsed, 0);
        assert_eq!(format.color, Some(0xff0000ff));
        assert_eq!(format.font.as_deref(), Some("Arial"));
        assert_eq!(format.size, Some(24.0));
    }
}
