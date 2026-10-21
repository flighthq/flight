use flight_font::contract::*;

mod get_font_shorthand {
    use super::*;

    #[test]
    fn backslash_escapes_quotes_and_backslashes() {
        assert_eq!(
            get_font_shorthand("Josh's Font", None),
            "1em 'Josh\\'s Font'"
        );
        assert_eq!(
            get_font_shorthand("Back\\slash", None),
            "1em 'Back\\\\slash'"
        );
    }

    #[test]
    fn includes_only_a_nonempty_style_prefix() {
        assert_eq!(
            get_font_shorthand("MyFont", Some("italic")),
            "italic 1em 'MyFont'"
        );
        assert_eq!(get_font_shorthand("MyFont", Some("")), "1em 'MyFont'");
    }

    #[test]
    fn quotes_a_plain_family_name_at_one_em() {
        assert_eq!(get_font_shorthand("MyFont", None), "1em 'MyFont'");
    }
}
