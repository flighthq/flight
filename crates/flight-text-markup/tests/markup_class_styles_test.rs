use flight_text_markup::contract::*;
use flight_textformat::TextFormat;

use crate::support::*;

fn span_format(registry: &MarkupTagRegistry, class: &str) -> TextFormat {
    let handler = get_markup_tag_handler(registry, "span").expect("span handler");
    return format_of(handler(&attributes(&[("class", class)]), &empty_format()));
}

fn bold() -> TextFormat {
    return TextFormat {
        bold: Some(true),
        ..empty_format()
    };
}

mod create_markup_class_styles {
    use super::*;

    #[test]
    fn creates_an_empty_live_class_map() {
        let styles = create_markup_class_styles();
        assert!(flight_entity::entries(&styles.read().unwrap()).is_empty());
    }
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
        let format = span_format(&registry, "warn");
        assert_eq!(format.bold, Some(true));
        assert_eq!(format.color, Some(0xff0000ff));
    }

    #[test]
    fn leaves_a_span_inert_when_its_class_is_not_in_the_map() {
        let mut registry = standard_registry();
        let styles = class_styles(&[("warn", bold())]);
        register_markup_class_styles(&mut registry, &styles);
        assert_eq!(span_format(&registry, "unknown"), empty_format());
    }

    #[test]
    fn leaves_a_span_inert_until_class_styles_are_registered() {
        let registry = standard_registry();
        assert_eq!(span_format(&registry, "warn"), empty_format());
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
        let format = span_format(&registry, "big loud quiet");
        assert_eq!(format.bold, Some(true));
        assert_eq!(format.color, Some(0x333333ff));
        assert_eq!(format.size, Some(24.0));
    }

    #[test]
    fn matches_class_names_case_sensitively() {
        let mut registry = standard_registry();
        let styles = class_styles(&[("Warn", bold())]);
        register_markup_class_styles(&mut registry, &styles);
        assert_eq!(span_format(&registry, "warn"), empty_format());
        assert_eq!(span_format(&registry, "Warn").bold, Some(true));
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
        let format = span_format(&registry, "tag");
        assert_eq!(format.italic, Some(true));
        assert_eq!(format.bold, None);
    }

    #[test]
    fn reads_the_class_map_live_at_parse_time() {
        let mut registry = standard_registry();
        let styles = class_styles(&[]);
        register_markup_class_styles(&mut registry, &styles);
        assert_eq!(span_format(&registry, "late"), empty_format());
        flight_entity::set_record_value(&mut styles.write().unwrap(), String::from("late"), bold());
        assert_eq!(span_format(&registry, "late").bold, Some(true));
    }
}
