use crate::common::fields;
use flight_entity::set_record_value;
use flight_net::*;

mod format_net_form_body {
    use super::*;
    #[test]
    fn encodes_fields_in_source_order_with_form_space_semantics() {
        assert_eq!(
            format_net_form_body(&fields(&[
                ("query", "flight sdk"),
                ("redirect", "https://example.test/a?x=1&y=2")
            ])),
            "query=flight+sdk&redirect=https%3A%2F%2Fexample.test%2Fa%3Fx%3D1%26y%3D2"
        );
    }
    #[test]
    fn encodes_form_unsafe_punctuation_and_unicode() {
        assert_eq!(
            format_net_form_body(&fields(&[("!~'()", "café")])),
            "%21%7E%27%28%29=caf%C3%A9"
        );
    }
    #[test]
    fn retains_numeric_first_property_order_and_replacement_position() {
        let mut input = fields(&[
            ("tail", "T"),
            ("10", "ten"),
            ("2", "two"),
            ("01", "leading"),
            ("0", "zero"),
        ]);
        set_record_value(&mut input, "tail".to_string(), "updated".to_string());
        assert_eq!(
            format_net_form_body(&input),
            "0=zero&2=two&10=ten&tail=updated&01=leading"
        );
    }
    #[test]
    fn preserves_star_and_safe_characters_but_encodes_plus_percent_and_reserved_bytes() {
        assert_eq!(
            format_net_form_body(&fields(&[("-_. *", "+%&=/?#\0😀")])),
            "-_.+*=%2B%25%26%3D%2F%3F%23%00%F0%9F%98%80"
        );
        assert_eq!(format_net_form_body(&fields(&[])), "");
        assert_eq!(format_net_form_body(&fields(&[("", "")])), "=");
    }
}

mod net_form_content_type {
    use super::*;
    #[test]
    fn declares_the_exact_encoding() {
        assert_eq!(
            NET_FORM_CONTENT_TYPE,
            "application/x-www-form-urlencoded;charset=UTF-8"
        );
    }
}
