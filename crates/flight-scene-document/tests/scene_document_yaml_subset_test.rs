// flight-lint: allow-file(f64) D1: YAML subset numbers are JS Numbers
use flight_scene_document::contract::*;

use crate::support::*;

fn expect_refusal(
    source: &str,
    kind: FlightDocumentRefusalReason,
) -> SceneDocumentYamlSubsetRefusal {
    let SceneDocumentYamlSubsetResult::Refusal(refusal) = parse_scene_document_yaml_subset(source)
    else {
        panic!("Expected {kind:?}, received a parsed value");
    };
    assert_eq!(refusal.kind, kind);
    assert!(refusal.line > 0);
    assert!(refusal.column > 0);
    return refusal;
}

fn expect_value(source: &str) -> SceneDocumentYamlSubsetValue {
    let SceneDocumentYamlSubsetResult::Ok(value) = parse_scene_document_yaml_subset(source) else {
        panic!("expected a parsed value");
    };
    return value;
}

fn is_ok(source: &str) -> bool {
    return matches!(
        parse_scene_document_yaml_subset(source),
        SceneDocumentYamlSubsetResult::Ok(_)
    );
}

fn create_block_mapping(size: usize) -> String {
    return (0..size)
        .map(|index| format!("k{index}: 0"))
        .collect::<Vec<_>>()
        .join("\n");
}

fn create_nested_flow_mapping(depth: usize) -> String {
    return format!("{}null{}", "{ value: ".repeat(depth), " }".repeat(depth));
}

fn create_node_bound_document(last_collection_size: usize) -> String {
    return [65_536, 65_536, 65_536, last_collection_size]
        .iter()
        .map(|size| format!("-\n{}", vec!["  - 0"; *size].join("\n")))
        .collect::<Vec<_>>()
        .join("\n");
}

fn string(value: &str) -> SceneDocumentYamlSubsetValue {
    return SceneDocumentYamlSubsetValue::String(value.to_string());
}

fn yaml_number(value: f64) -> SceneDocumentYamlSubsetValue {
    return SceneDocumentYamlSubsetValue::Number(value);
}

mod parse_scene_document_yaml_subset {
    use super::*;

    #[test]
    fn decodes_a_lone_surrogate_escape_to_the_replacement_character() {
        // Principal d1eaec43: a lone \u surrogate has no UTF-8 form, so the native boundary replaces
        // it with U+FFFD (the source keeps the lone code unit in its UTF-16 string).
        assert!(yaml_equal(
            &expect_value("value: \"\\uD800\"\n"),
            &mapping(vec![("value", yaml_string("\u{FFFD}"))])
        ));
    }

    #[test]
    fn types_every_emitted_refusal_as_a_subset_of_the_public_taxonomy() {
        // The refusal kind is the public FlightDocumentRefusalReason itself, so every emitted kind
        // is a member of the taxonomy by construction.
        let refusal = expect_refusal(
            "value: *root",
            FlightDocumentRefusalReason::AliasUnsupported,
        );
        let kind: FlightDocumentRefusalReason = refusal.kind;
        assert_eq!(
            get_flight_document_refusal_reason_string(kind),
            "flight-document.unsupported.alias"
        );
    }

    #[test]
    fn parses_block_sequences_together_with_block_and_flow_mappings() {
        let value = expect_value(
            "scene:\n  kind: Scene2D\n  position: { x: 1, y: -2, metadata: { visible: true } }\n  children:\n    - kind: Sprite\n      name: hero\n    - { kind: Shape, visible: false }\n",
        );
        let expected = mapping(vec![(
            "scene",
            mapping(vec![
                ("kind", string("Scene2D")),
                (
                    "position",
                    mapping(vec![
                        ("x", yaml_number(1.0)),
                        ("y", yaml_number(-2.0)),
                        (
                            "metadata",
                            mapping(vec![(
                                "visible",
                                SceneDocumentYamlSubsetValue::Boolean(true),
                            )]),
                        ),
                    ]),
                ),
                (
                    "children",
                    SceneDocumentYamlSubsetValue::Sequence(vec![
                        mapping(vec![("kind", string("Sprite")), ("name", string("hero"))]),
                        mapping(vec![
                            ("kind", string("Shape")),
                            ("visible", SceneDocumentYamlSubsetValue::Boolean(false)),
                        ]),
                    ]),
                ),
            ]),
        )]);
        assert!(yaml_equal(&value, &expected), "{value:?}");
    }

    #[test]
    fn applies_explicit_scalar_rules_without_yaml_1_1_implicit_typing() {
        let value = expect_value(
            "nullValue: null\ntrueValue: true\nfalseValue: false\ninteger: -12\ndecimal: 1.25\nexponent: -1.25e2\ncolor: 0x3366ccff\nlegacyNo: no\nlegacyOff: off\nleadingZero: 012\nsexagesimal: 1:20\nquoted: \"line\\nvalue\\u0021\"\nsingleQuoted: 'Flight''s subset'\n",
        );
        let expected = mapping(vec![
            ("nullValue", SceneDocumentYamlSubsetValue::Null),
            ("trueValue", SceneDocumentYamlSubsetValue::Boolean(true)),
            ("falseValue", SceneDocumentYamlSubsetValue::Boolean(false)),
            ("integer", yaml_number(-12.0)),
            ("decimal", yaml_number(1.25)),
            ("exponent", yaml_number(-125.0)),
            ("color", yaml_number(f64::from(0x3366ccffu32))),
            ("legacyNo", string("no")),
            ("legacyOff", string("off")),
            ("leadingZero", string("012")),
            ("sexagesimal", string("1:20")),
            ("quoted", string("line\nvalue!")),
            ("singleQuoted", string("Flight's subset")),
        ]);
        assert!(yaml_equal(&value, &expected), "{value:?}");
    }

    #[test]
    fn uses_one_token_aware_scan_for_quoted_plain_escaped_and_commented_indicators() {
        let value = expect_value(
            "quoted: \"&anchor *alias !!tag --- ... [ ] { } , # literal\"\nescaped: \"escaped quote: \\\" [still scalar]\"\nsingle: 'it''s [scalar] &not-anchor'\nampersand: rock&roll\nbang: bang!value\napostrophe: don't\nurl: https://host/a#fragment\n# &anchor *alias !!tag --- ... [ ] { } ,\n",
        );
        let expected = mapping(vec![
            (
                "quoted",
                string("&anchor *alias !!tag --- ... [ ] { } , # literal"),
            ),
            ("escaped", string("escaped quote: \" [still scalar]")),
            ("single", string("it's [scalar] &not-anchor")),
            ("ampersand", string("rock&roll")),
            ("bang", string("bang!value")),
            ("apostrophe", string("don't")),
            ("url", string("https://host/a#fragment")),
        ]);
        assert!(yaml_equal(&value, &expected), "{value:?}");
    }

    #[test]
    fn names_the_out_of_subset_refusal_for_each_unsupported_construct() {
        let cases = [
            (
                "value: &root { child: true }",
                FlightDocumentRefusalReason::AnchorUnsupported,
            ),
            (
                "value: *root",
                FlightDocumentRefusalReason::AliasUnsupported,
            ),
            (
                "value: !!str text",
                FlightDocumentRefusalReason::TagUnsupported,
            ),
            (
                "value: !local text",
                FlightDocumentRefusalReason::TagUnsupported,
            ),
            (
                "---\nvalue: true",
                FlightDocumentRefusalReason::DocumentSeparatorUnsupported,
            ),
            (
                "...\n",
                FlightDocumentRefusalReason::DocumentSeparatorUnsupported,
            ),
        ];
        for (source, kind) in cases {
            let refusal = expect_refusal(source, kind);
            assert_eq!(refusal.limit, None, "{source}");
            assert_eq!(refusal.actual, None, "{source}");
        }
    }

    #[test]
    fn recovers_lexical_state_before_refusing_a_real_indicator_after_plain_apostrophes_and_escapes()
    {
        expect_refusal(
            "value: don't &root",
            FlightDocumentRefusalReason::AnchorUnsupported,
        );
        expect_refusal(
            "value: \"quoted \\\" value\" &root",
            FlightDocumentRefusalReason::AnchorUnsupported,
        );
    }

    #[test]
    fn names_malformed_and_ambiguous_constructs_instead_of_guessing() {
        expect_refusal(
            "items: [one, two]",
            FlightDocumentRefusalReason::FlowSequenceUnsupported,
        );
        expect_refusal(
            "value: |\n  text",
            FlightDocumentRefusalReason::BlockScalarUnsupported,
        );
        expect_refusal(
            "value: 1\nvalue: 2",
            FlightDocumentRefusalReason::DuplicateKey,
        );
        expect_refusal(
            "value: 1e999",
            FlightDocumentRefusalReason::NumberOutOfRange,
        );
        expect_refusal(
            "value: \"bad\\q\"",
            FlightDocumentRefusalReason::InvalidEscape,
        );
    }

    #[test]
    fn accepts_exactly_4194304_document_code_units_and_refuses_the_next_code_unit_first() {
        let at_limit = format!("#{}", "x".repeat(4_194_303));
        assert_eq!(at_limit.encode_utf16().count(), 4_194_304);
        assert!(yaml_equal(
            &expect_value(&at_limit),
            &SceneDocumentYamlSubsetValue::Null
        ));

        let refusal = expect_refusal(
            &format!("{at_limit}x"),
            FlightDocumentRefusalReason::DocumentCodeUnitsLimitExceeded,
        );
        assert_eq!(
            (refusal.limit, refusal.actual, refusal.offset),
            (Some(4_194_304), Some(4_194_305), 4_194_304)
        );

        let crlf_refusal = expect_refusal(
            &"\r\n".repeat(2_097_153),
            FlightDocumentRefusalReason::DocumentCodeUnitsLimitExceeded,
        );
        assert_eq!(crlf_refusal.limit, Some(4_194_304));
        assert_eq!(crlf_refusal.actual, Some(4_194_306));
        assert_eq!(crlf_refusal.offset, 4_194_304);
        assert_eq!(crlf_refusal.line, 2_097_153);
        assert_eq!(crlf_refusal.column, 1);

        let astral_refusal = expect_refusal(
            &"😀".repeat(2_097_153),
            FlightDocumentRefusalReason::DocumentCodeUnitsLimitExceeded,
        );
        assert_eq!(
            (
                astral_refusal.limit,
                astral_refusal.actual,
                astral_refusal.offset
            ),
            (Some(4_194_304), Some(4_194_306), 4_194_304)
        );
    }

    #[test]
    fn accepts_exactly_64_nested_collections_and_refuses_collection_65() {
        assert!(is_ok(&create_nested_flow_mapping(64)));

        let refusal = expect_refusal(
            &create_nested_flow_mapping(65),
            FlightDocumentRefusalReason::NestingDepthLimitExceeded,
        );
        assert_eq!((refusal.limit, refusal.actual), (Some(64), Some(65)));
    }

    #[test]
    fn accepts_exactly_65536_sequence_items_and_refuses_item_65537_before_append() {
        let at_limit = vec!["- 0"; 65_536].join("\n");
        let SceneDocumentYamlSubsetValue::Sequence(items) = expect_value(&at_limit) else {
            panic!("expected a sequence");
        };
        assert_eq!(items.len(), 65_536);

        let refusal = expect_refusal(
            &format!("{at_limit}\n- 0"),
            FlightDocumentRefusalReason::CollectionEntriesLimitExceeded,
        );
        assert_eq!(
            (refusal.limit, refusal.actual),
            (Some(65_536), Some(65_537))
        );
    }

    #[test]
    fn accepts_exactly_65536_mapping_pairs_and_refuses_pair_65537_before_insertion() {
        let at_limit = create_block_mapping(65_536);
        assert!(is_ok(&at_limit));

        let refusal = expect_refusal(
            &format!("{at_limit}\nk65536: 0"),
            FlightDocumentRefusalReason::CollectionEntriesLimitExceeded,
        );
        assert_eq!(
            (refusal.limit, refusal.actual),
            (Some(65_536), Some(65_537))
        );
    }

    #[test]
    fn accepts_exactly_65536_decoded_scalar_code_units_and_refuses_code_unit_65537() {
        let at_limit = "x".repeat(65_536);
        assert!(yaml_equal(&expect_value(&at_limit), &string(&at_limit)));

        let refusal = expect_refusal(
            &format!("{at_limit}x"),
            FlightDocumentRefusalReason::ScalarCodeUnitsLimitExceeded,
        );
        assert_eq!(
            (refusal.limit, refusal.actual),
            (Some(65_536), Some(65_537))
        );
    }

    #[test]
    fn counts_escaped_and_astral_scalar_content_by_decoded_utf16_code_units() {
        let escaped_at_limit = format!("\"{}\"", "\\u0061".repeat(65_536));
        let SceneDocumentYamlSubsetValue::String(escaped) = expect_value(&escaped_at_limit) else {
            panic!("expected a string");
        };
        assert_eq!(escaped.encode_utf16().count(), 65_536);
        let escaped_refusal = expect_refusal(
            &format!("\"{}\"", "\\u0061".repeat(65_537)),
            FlightDocumentRefusalReason::ScalarCodeUnitsLimitExceeded,
        );
        assert_eq!(
            (escaped_refusal.limit, escaped_refusal.actual),
            (Some(65_536), Some(65_537))
        );

        let astral_at_limit = "😀".repeat(32_768);
        assert_eq!(astral_at_limit.encode_utf16().count(), 65_536);
        assert!(is_ok(&astral_at_limit));
        let astral_refusal = expect_refusal(
            &format!("{astral_at_limit}😀"),
            FlightDocumentRefusalReason::ScalarCodeUnitsLimitExceeded,
        );
        assert_eq!(
            (astral_refusal.limit, astral_refusal.actual),
            (Some(65_536), Some(65_537))
        );
    }

    #[test]
    fn accepts_exactly_256_decoded_key_code_units_and_refuses_key_code_unit_257_before_lookup() {
        let plain_at_limit = "k".repeat(256);
        assert!(is_ok(&format!("{plain_at_limit}: true")));
        let plain_refusal = expect_refusal(
            &format!("{plain_at_limit}k: true"),
            FlightDocumentRefusalReason::KeyCodeUnitsLimitExceeded,
        );
        assert_eq!(
            (plain_refusal.limit, plain_refusal.actual),
            (Some(256), Some(257))
        );

        let quoted_at_limit = format!("{}\"", "k".repeat(255));
        assert!(is_ok(&format!("\"{}\\\"\": true", "k".repeat(255))));
        assert_eq!(quoted_at_limit.encode_utf16().count(), 256);
        let quoted_refusal = expect_refusal(
            &format!("\"{}\\\"\": true", "k".repeat(256)),
            FlightDocumentRefusalReason::KeyCodeUnitsLimitExceeded,
        );
        assert_eq!(
            (quoted_refusal.limit, quoted_refusal.actual),
            (Some(256), Some(257))
        );
    }

    #[test]
    fn accepts_exactly_262144_total_nodes_and_refuses_node_262145_before_allocation() {
        assert!(is_ok(&create_node_bound_document(65_531)));

        let refusal = expect_refusal(
            &create_node_bound_document(65_532),
            FlightDocumentRefusalReason::TotalNodesLimitExceeded,
        );
        assert_eq!(
            (refusal.limit, refusal.actual),
            (Some(262_144), Some(262_145))
        );
    }
}
