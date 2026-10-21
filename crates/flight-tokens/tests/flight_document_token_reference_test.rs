use std::cell::RefCell;

use flight_scene_document::FlightDocumentValue;
use flight_tokens::contract::*;

use crate::support::*;

// A seam this case must never reach.
fn fail_lookup(_key: &str, _path: &str) -> Option<FlightDocumentValue> {
    panic!("the walker consulted a seam this case must never reach");
}

fn fail_refuse(_path: &str) {
    panic!("the walker consulted a seam this case must never reach");
}

mod invalid_flight_document_token_value {
    use super::*;

    #[test]
    fn is_distinct_from_null_which_a_document_may_legitimately_hold() {
        // The source sentinel is a symbol; Rust's is Option::None beside the document's own Null.
        assert!(INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE.is_none());
        let null = substitute_flight_document_token_value(
            &FlightDocumentValue::Null,
            "fields.blendMode",
            &mut fail_lookup,
            &mut fail_refuse,
        );
        assert!(matches!(null, Some(FlightDocumentValue::Null)));
    }
}

mod is_flight_document_token_reference {
    use super::*;

    #[test]
    fn accepts_a_sigil_prefixed_scalar_and_rejects_an_escaped_or_ordinary_one() {
        assert!(is_flight_document_token_reference(&text("$color.primary")));
        assert!(!is_flight_document_token_reference(&text("$$5.00")));
        assert!(!is_flight_document_token_reference(&text("color.primary")));
    }

    #[test]
    fn rejects_every_non_string_value_including_one_that_could_carry_a_reference_inside_it() {
        assert!(!is_flight_document_token_reference(&number(8.0)));
        assert!(!is_flight_document_token_reference(
            &FlightDocumentValue::Null
        ));
        assert!(!is_flight_document_token_reference(&array(vec![text(
            "$color.primary"
        )])));
    }
}

mod read_flight_document_token_reference_key {
    use super::*;

    #[test]
    fn reads_a_dotted_key_as_one_flat_name_rather_than_a_path() {
        assert_eq!(
            read_flight_document_token_reference_key("$color.primary").as_deref(),
            Some("color.primary")
        );
        assert_eq!(
            read_flight_document_token_reference_key("$acme.brand.primary").as_deref(),
            Some("acme.brand.primary")
        );
    }

    #[test]
    fn refuses_a_key_the_codec_would_have_had_to_quote() {
        assert_eq!(read_flight_document_token_reference_key("$9lives"), None);
        assert_eq!(read_flight_document_token_reference_key("$"), None);
        assert_eq!(read_flight_document_token_reference_key("$has space"), None);
    }
}

mod substitute_flight_document_token_value {
    use super::*;

    #[test]
    fn replaces_references_at_every_depth_and_leaves_other_scalars_alone() {
        let value = object(vec![
            (
                "commands",
                array(vec![object(vec![(
                    "beginFill",
                    object(vec![
                        ("alpha", number(1.0)),
                        ("color", text("$color.primary")),
                    ]),
                )])]),
            ),
            ("name", text("card")),
        ]);
        let substituted = substitute_flight_document_token_value(
            &value,
            "fields",
            &mut |key: &str, _at: &str| {
                return if key == "color.primary" {
                    Some(number(f64::from(0x3366ccff_u32)))
                } else {
                    INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE
                };
            },
            &mut fail_refuse,
        )
        .expect("every reference resolves");
        let expected = object(vec![
            (
                "commands",
                array(vec![object(vec![(
                    "beginFill",
                    object(vec![
                        ("alpha", number(1.0)),
                        ("color", number(f64::from(0x3366ccff_u32))),
                    ]),
                )])]),
            ),
            ("name", text("card")),
        ]);
        assert!(value_equal(&substituted, &expected));
    }

    #[test]
    fn unescapes_a_doubled_sigil_without_consulting_the_lookup() {
        let value = substitute_flight_document_token_value(
            &text("$$5.00"),
            "fields.text",
            &mut fail_lookup,
            &mut fail_refuse,
        );
        assert!(value_equal(&value.unwrap(), &text("$5.00")));
    }

    #[test]
    fn reports_the_path_of_a_malformed_reference_and_stops() {
        let paths = RefCell::new(Vec::new());
        let value = object(vec![(
            "commands",
            array(vec![object(vec![(
                "beginFill",
                object(vec![("color", text("$9lives"))]),
            )])]),
        )]);
        let substituted = substitute_flight_document_token_value(
            &value,
            "fields",
            &mut |_key: &str, _at: &str| INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
            &mut |path: &str| paths.borrow_mut().push(path.to_string()),
        );
        assert!(substituted.is_none());
        assert_eq!(
            *paths.borrow(),
            vec!["fields.commands[0].beginFill.color".to_string()]
        );
    }

    #[test]
    fn propagates_a_lookup_refusal_out_of_a_nested_array() {
        let value = array(vec![number(1.0), array(vec![text("$color.absent")])]);
        let substituted = substitute_flight_document_token_value(
            &value,
            "fields.ratios",
            &mut |_key: &str, _at: &str| INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
            &mut fail_refuse,
        );
        assert!(substituted.is_none());
    }

    #[test]
    fn returns_a_null_scalar_as_a_value_rather_than_as_a_failure() {
        let value = substitute_flight_document_token_value(
            &FlightDocumentValue::Null,
            "fields.blendMode",
            &mut fail_lookup,
            &mut fail_refuse,
        );
        assert!(matches!(value, Some(FlightDocumentValue::Null)));
    }
}
