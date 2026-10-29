//! flight-compiler: target-native

use flight_text_markup::contract::*;
use flight_textformat::TextFormat;

use crate::support::*;

fn bold() -> TextFormat {
    return TextFormat {
        bold: Some(true),
        ..empty_format()
    };
}

mod register_markup_class_styles {
    use super::*;

    #[test]
    fn styles_a_span_by_its_class_after_being_registered() {
        let mut registry = standard_registry();
        let styles = class_styles(&[(
            "warn",
            TextFormat {
                bold: Some(true),
                color: Some(0xff0000ff),
                ..empty_format()
            },
        )]);
        register_markup_class_styles(&mut registry, &styles);
        let parsed = parse_with("<span class=\"warn\">x</span>", &registry);
        assert_eq!(parsed.text, "x");
        let format = format_at(&parsed, 0);
        assert_eq!(format.bold, Some(true));
        assert_eq!(format.color, Some(0xff0000ff));
    }

    #[test]
    fn leaves_a_span_inert_when_its_class_is_not_in_the_map() {
        let mut registry = standard_registry();
        let styles = class_styles(&[("warn", bold())]);
        register_markup_class_styles(&mut registry, &styles);
        let parsed = parse_with("<span class=\"unknown\">x</span>", &registry);
        assert_eq!(parsed.text, "x");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn leaves_a_span_inert_until_class_styles_are_registered() {
        let registry = standard_registry();
        let parsed = parse_with("<span class=\"warn\">x</span>", &registry);
        assert_eq!(parsed.text, "x");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn merges_several_space_separated_classes_left_to_right() {
        let mut registry = standard_registry();
        let styles = class_styles(&[
            (
                "big",
                TextFormat {
                    size: Some(24.0),
                    ..empty_format()
                },
            ),
            (
                "loud",
                TextFormat {
                    bold: Some(true),
                    color: Some(0x0000ffff),
                    ..empty_format()
                },
            ),
            (
                "quiet",
                TextFormat {
                    color: Some(0x333333ff),
                    ..empty_format()
                },
            ),
        ]);
        register_markup_class_styles(&mut registry, &styles);
        let parsed = parse_with("<span class=\"big loud quiet\">x</span>", &registry);
        let format = format_at(&parsed, 0);
        assert_eq!(format.bold, Some(true));
        assert_eq!(format.color, Some(0x333333ff));
        assert_eq!(format.size, Some(24.0));
    }

    #[test]
    fn matches_class_names_case_sensitively() {
        let mut registry = standard_registry();
        let styles = class_styles(&[("Warn", bold())]);
        register_markup_class_styles(&mut registry, &styles);
        let lower = parse_with("<span class=\"warn\">x</span>", &registry);
        assert_eq!(format_at(&lower, 0), empty_format());
        let upper = parse_with("<span class=\"Warn\">x</span>", &registry);
        assert_eq!(format_at(&upper, 0).bold, Some(true));
    }

    #[test]
    fn is_last_write_wins_over_a_previously_installed_class_resolver() {
        let mut registry = standard_registry();
        register_markup_class_styles(&mut registry, &class_styles(&[("tag", bold())]));
        register_markup_class_styles(
            &mut registry,
            &class_styles(&[(
                "tag",
                TextFormat {
                    italic: Some(true),
                    ..empty_format()
                },
            )]),
        );
        let parsed = parse_with("<span class=\"tag\">x</span>", &registry);
        let format = format_at(&parsed, 0);
        assert_eq!(format.italic, Some(true));
        assert_eq!(format.bold, None);
    }

    #[test]
    fn reads_the_class_map_live_at_parse_time() {
        let mut registry = standard_registry();
        let styles = class_styles(&[]);
        register_markup_class_styles(&mut registry, &styles);
        let before = parse_with("<span class=\"late\">x</span>", &registry);
        assert!(before.format_ranges.is_empty());
        flight_entity::set_record_value(&mut styles.write().unwrap(), String::from("late"), bold());
        let after = parse_with("<span class=\"late\">x</span>", &registry);
        assert_eq!(format_at(&after, 0).bold, Some(true));
    }
}
