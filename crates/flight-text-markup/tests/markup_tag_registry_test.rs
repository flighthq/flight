use std::sync::Arc;

use flight_text_markup::contract::*;
use flight_textformat::TextFormat;

use crate::support::*;

mod create_markup_attributes {
    use super::*;

    #[test]
    fn builds_a_decoded_attribute_map_from_name_value_pairs() {
        let map = create_markup_attributes(&[("color", "#f00"), ("size", "12")]);
        assert_eq!(
            flight_entity::get_record_value(&map, "color").map(String::as_str),
            Some("#f00")
        );
        assert_eq!(
            flight_entity::get_record_value(&map, "size").map(String::as_str),
            Some("12")
        );
    }
}

mod create_markup_hex_resolver {
    use super::*;

    #[test]
    fn resolves_hex_and_rejects_named_values() {
        let resolver = create_markup_hex_resolver();
        assert_eq!(resolver("#ff0000"), Some(0xff0000ff));
        assert_eq!(resolver("red"), None);
    }
}

mod create_markup_tag_registry {
    use super::*;

    #[test]
    fn returns_an_empty_independent_registry() {
        let mut first = create_markup_tag_registry();
        let second = create_markup_tag_registry();
        assert_eq!(first.handlers.len(), 0);
        register_markup_tag(
            &mut first,
            "b",
            Arc::new(|_attributes, _enclosing| {
                MarkupTagResult::Format(flight_textformat::TextFormat {
                    bold: Some(true),
                    ..empty_format()
                })
            }),
        );
        assert_eq!(first.handlers.len(), 1);
        assert_eq!(second.handlers.len(), 0);
    }

    #[test]
    fn supplies_the_dialect_for_parse_text_markup_so_an_empty_registry_keeps_text_but_no_format() {
        let registry = create_markup_tag_registry();
        let content = parse_with("<b>plain</b>", &registry);
        assert_eq!(content.text, "plain");
        assert!(content.format_ranges.is_empty());
    }
}

mod get_markup_tag_handler {
    use super::*;

    #[test]
    fn looks_up_case_insensitively_and_reports_missing_tags() {
        let registry = standard_registry();
        assert!(get_markup_tag_handler(&registry, "B").is_some());
        assert!(get_markup_tag_handler(&registry, "unknown-tag").is_none());
    }
}

mod register_markup_tag {
    use super::*;

    #[test]
    fn registers_a_custom_tag_whose_handler_contributes_format() {
        let mut registry = create_markup_tag_registry();
        register_markup_tag(
            &mut registry,
            "acme.hot",
            Arc::new(|_attributes, _enclosing| {
                MarkupTagResult::Format(flight_textformat::TextFormat {
                    color: Some(0xff0000ff),
                    ..empty_format()
                })
            }),
        );
        let content = parse_with("<acme.hot>x</acme.hot>", &registry);
        assert_eq!(format_at(&content, 0).color, Some(0xff0000ff));
    }

    #[test]
    fn matches_tag_names_case_insensitively() {
        let mut registry = create_markup_tag_registry();
        register_markup_tag(
            &mut registry,
            "Loud",
            Arc::new(|_attributes, _enclosing| {
                MarkupTagResult::Format(TextFormat {
                    bold: Some(true),
                    ..empty_format()
                })
            }),
        );
        assert_eq!(
            format_at(&parse_with("<LOUD>x</LOUD>", &registry), 0).bold,
            Some(true)
        );
        assert_eq!(registry.handlers[0].0, "loud");
    }

    #[test]
    fn is_last_write_wins_so_a_later_registration_overrides_an_earlier_one() {
        let mut registry = create_markup_tag_registry();
        register_markup_tag(
            &mut registry,
            "x",
            Arc::new(|_attributes, _enclosing| {
                MarkupTagResult::Format(TextFormat {
                    bold: Some(true),
                    ..empty_format()
                })
            }),
        );
        register_markup_tag(
            &mut registry,
            "x",
            Arc::new(|_attributes, _enclosing| {
                MarkupTagResult::Format(TextFormat {
                    italic: Some(true),
                    ..empty_format()
                })
            }),
        );
        let content = parse_with("<x>y</x>", &registry);
        assert_eq!(format_at(&content, 0).italic, Some(true));
        assert_eq!(format_at(&content, 0).bold, None);
    }

    #[test]
    fn reads_a_handler_provided_attribute_map() {
        let mut registry = create_markup_tag_registry();
        register_markup_tag(
            &mut registry,
            "size",
            Arc::new(|attributes, _enclosing| {
                let value = flight_entity::get_record_value(attributes, "value")
                    .and_then(|raw| raw.parse::<f32>().ok());
                let mut format = empty_format();
                if let Some(value) = value {
                    format.size = Some(value);
                }
                return MarkupTagResult::Format(format);
            }),
        );
        let content = parse_with("<size value=\"18\">x</size>", &registry);
        assert_eq!(format_at(&content, 0).size, Some(18.0));
    }
}

mod register_standard_markup_tags {
    use super::*;

    #[test]
    fn registers_the_standard_style_font_block_and_break_tags() {
        let mut registry = create_markup_tag_registry();
        register_standard_markup_tags(&mut registry);
        for name in [
            "a",
            "b",
            "br",
            "em",
            "font",
            "i",
            "li",
            "p",
            "s",
            "span",
            "strike",
            "strong",
            "textformat",
            "u",
        ] {
            assert!(
                get_markup_tag_handler(&registry, name).is_some(),
                "{}",
                name
            );
        }
    }

    #[test]
    fn maps_the_bold_italic_and_strike_aliases_to_the_same_booleans() {
        let registry = standard_registry();
        assert_eq!(
            format_at(&parse_with("<strong>x</strong>", &registry), 0).bold,
            Some(true)
        );
        assert_eq!(
            format_at(&parse_with("<em>x</em>", &registry), 0).italic,
            Some(true)
        );
        assert_eq!(
            format_at(&parse_with("<strike>x</strike>", &registry), 0).strikethrough,
            Some(true)
        );
        assert_eq!(
            format_at(&parse_with("<s>x</s>", &registry), 0).strikethrough,
            Some(true)
        );
    }

    #[test]
    fn parses_a_hex_font_color_but_leaves_a_named_color_unresolved_by_default() {
        let registry = standard_registry();
        let hex = parse_with("<font color=\"#ff0000\">x</font>", &registry);
        assert_eq!(format_at(&hex, 0).color, Some(0xff0000ff));
        let named = parse_with("<font color=\"red\">x</font>", &registry);
        assert_eq!(format_at(&named, 0).color, None);
    }

    #[test]
    fn installs_the_hex_only_color_resolver_as_the_registry_seam() {
        let registry = standard_registry();
        let seams = registry.seams.read().unwrap();
        let resolver = seams.color_resolver.as_ref().expect("color seam");
        assert_eq!(resolver("#00ff00"), Some(0x00ff00ff));
        assert_eq!(resolver("red"), None);
    }

    #[test]
    fn maps_a_block_tag_to_a_break_before_effect_and_its_format() {
        let registry = standard_registry();
        let handler = get_markup_tag_handler(&registry, "p").expect("p handler");
        let result = handler(&attributes(&[("align", "center")]), &empty_format());
        let MarkupTagResult::Effect(effect) = result else {
            panic!("p is a structural effect");
        };
        assert_eq!(effect.break_before, Some(true));
        let content = parse_with("a<p align=\"center\">b</p>", &registry);
        assert_eq!(content.text, "a\nb");
        assert_eq!(
            format_at(&content, 2).align,
            Some(flight_textformat::TextFormatAlign::Center)
        );

        let list = get_markup_tag_handler(&registry, "li").expect("li handler");
        let MarkupTagResult::Effect(list_effect) =
            list(&attributes(&[("type", "square")]), &empty_format())
        else {
            panic!("li is a structural effect");
        };
        assert_eq!(list_effect.break_before, Some(true));
        let list_format = list_effect.format.expect("format");
        assert_eq!(list_format.bullet, Some(true));
        assert_eq!(
            list_format.list_marker,
            Some(flight_textformat::TextFormatListMarker::Square)
        );
    }

    #[test]
    fn inserts_a_literal_newline_for_a_break_tag() {
        let registry = standard_registry();
        let handler = get_markup_tag_handler(&registry, "br").expect("br handler");
        let MarkupTagResult::Effect(effect) = handler(&attributes(&[]), &empty_format()) else {
            panic!("br is a structural effect");
        };
        assert_eq!(effect.text.as_deref(), Some("\n"));
        assert_eq!(effect.format, None);
    }

    #[test]
    fn maps_relative_font_size_against_the_enclosing_format() {
        let registry = standard_registry();
        let handler = get_markup_tag_handler(&registry, "font").expect("font handler");
        let enclosing = TextFormat {
            size: Some(12.0),
            ..empty_format()
        };
        let relative = format_of(handler(&attributes(&[("size", "+2")]), &enclosing));
        assert_eq!(relative.size, Some(14.0));
        let absolute = format_of(handler(&attributes(&[("size", "18")]), &enclosing));
        assert_eq!(absolute.size, Some(18.0));
    }

    #[test]
    fn maps_textformat_metrics_and_tab_stops() {
        let registry = standard_registry();
        let handler = get_markup_tag_handler(&registry, "textformat").expect("handler");
        let format = format_of(handler(
            &attributes(&[
                ("leftmargin", "4"),
                ("rightmargin", "8"),
                ("tabstops", "10, 20.5"),
            ]),
            &empty_format(),
        ));
        assert_eq!(format.left_margin, Some(4.0));
        assert_eq!(format.right_margin, Some(8.0));
        assert_eq!(format.tab_stops, Some(vec![10.0, 20.5]));
    }
}

mod resolve_markup_hex_color {
    use super::*;

    #[test]
    fn parses_rrggbb_rgb_and_0x_values() {
        assert_eq!(resolve_markup_hex_color("#ff0000"), Some(0xff0000ff));
        assert_eq!(resolve_markup_hex_color("#f00"), Some(0xff0000ff));
        assert_eq!(resolve_markup_hex_color("0x00ff00"), Some(0x00ff00ff));
        assert_eq!(resolve_markup_hex_color("  #0000FF  "), Some(0x0000ffff));
    }

    #[test]
    fn returns_none_for_a_named_color_or_unparseable_value() {
        assert_eq!(resolve_markup_hex_color("red"), None);
        assert_eq!(resolve_markup_hex_color("#zz0000"), None);
        assert_eq!(resolve_markup_hex_color("#ff000080"), None);
        assert_eq!(resolve_markup_hex_color(""), None);
    }
}
