// flight-lint: allow-file(f64) D1: token values are JavaScript Numbers
use std::sync::Arc;

use flight_entity::{allocate_entity, entries, get_entity_id, get_record_value};
use flight_registry::with_kind_map_entry;
use flight_scene_document::{
    FlightDocumentRefusalReason, FlightDocumentToken, FlightDocumentTokenResolverRegistry,
    FlightDocumentValue,
};
use flight_tokens::contract::*;

use crate::support::*;

fn color(value: u32) -> FlightDocumentValue {
    return number(f64::from(value));
}

// The resolved table for a scene holding only `entry`, as (key, value) pairs; `None` when refused.
fn resolve_one(
    registry: &FlightDocumentTokenResolverRegistry,
    entry: FlightDocumentToken,
) -> Option<Vec<(String, FlightDocumentValue)>> {
    let resolution = resolve_flight_document_scene_tokens(
        &scene_with_tokens(vec![entry]),
        "dark",
        Some(registry),
    )?;
    let mut pairs = Vec::new();
    entries(&mut pairs, &resolution.values);
    return Some(
        pairs
            .into_iter()
            .map(|(key, value)| (key.to_string(), value.clone()))
            .collect(),
    );
}

fn resolves_to(
    registry: &FlightDocumentTokenResolverRegistry,
    entry: FlightDocumentToken,
    expected: FlightDocumentValue,
) -> bool {
    return resolve_one(registry, entry).is_some_and(|pairs| {
        pairs.len() == 1 && pairs[0].0 == "a.token" && value_equal(&pairs[0].1, &expected)
    });
}

fn explain(
    tokens: Vec<FlightDocumentToken>,
) -> flight_scene_document::FlightDocumentRefusalExplanation {
    let registry = create_flight_document_token_resolver_registry();
    return explain_flight_document_scene_token_resolution(
        &scene_with_tokens(tokens),
        "dark",
        Some(&registry),
    )
    .expect("a refusal");
}

mod create_flight_document_token_resolver_registry {
    use super::*;

    #[test]
    fn admits_each_built_in_kind_only_for_the_values_that_kind_describes() {
        let registry = create_flight_document_token_resolver_registry();
        assert!(resolves_to(
            &registry,
            token("Color", vec![("default", color(0x3366ccff))]),
            color(0x3366ccff)
        ));
        assert!(resolve_one(&registry, token("Color", vec![("default", number(-1.0))])).is_none());
        assert!(resolve_one(&registry, token("Color", vec![("default", number(1.5))])).is_none());
        assert!(
            resolve_one(
                &registry,
                token("Color", vec![("default", number(4_294_967_296.0))])
            )
            .is_none()
        );
        assert!(resolve_one(&registry, token("Color", vec![("default", text("blue"))])).is_none());
        assert!(resolves_to(
            &registry,
            token("Number", vec![("default", number(1.5))]),
            number(1.5)
        ));
        assert!(resolve_one(&registry, token("Number", vec![("default", text("wide"))])).is_none());
        assert!(resolves_to(
            &registry,
            token(
                "Boolean",
                vec![("default", FlightDocumentValue::Boolean(true))]
            ),
            FlightDocumentValue::Boolean(true)
        ));
        assert!(resolve_one(&registry, token("Boolean", vec![("default", number(1.0))])).is_none());
        assert!(resolves_to(
            &registry,
            token("String", vec![("default", text("Inter"))]),
            text("Inter")
        ));
        assert!(resolve_one(&registry, token("String", vec![("default", number(12.0))])).is_none());
    }

    #[test]
    fn stays_open_to_a_vendor_kind_the_sdk_never_registered() {
        let registry = create_flight_document_token_resolver_registry();
        let mut extended: FlightDocumentTokenResolverRegistry = allocate_entity();
        extended.resolvers = with_kind_map_entry(
            &registry.resolvers,
            "acme.Duration".to_string(),
            Arc::new(
                |value: &FlightDocumentValue, _token: &FlightDocumentToken| {
                    return match value {
                        FlightDocumentValue::Number(_) => Some(value.clone()),
                        _ => None,
                    };
                },
            ),
        );
        assert!(resolves_to(
            &extended,
            token("acme.Duration", vec![("default", number(150.0))]),
            number(150.0)
        ));
    }
}

mod explain_flight_document_scene_token_resolution {
    use super::*;

    #[test]
    fn names_an_unregistered_kind_against_the_token_that_carries_it() {
        let explanation = explain(vec![token("acme.Shadow", vec![("default", number(1.0))])]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenResolverUnregistered
        );
        assert_eq!(explanation.kind.as_deref(), Some("acme.Shadow"));
        assert_eq!(explanation.token_key.as_deref(), Some("a.token"));
        assert_eq!(explanation.path, "tokens[0].kind");
    }

    #[test]
    fn names_a_value_the_kind_refused_with_the_mode_it_was_authored_under() {
        let explanation = explain(vec![token("Color", vec![("dark", text("midnight"))])]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenValueInvalid
        );
        assert_eq!(explanation.mode.as_deref(), Some("dark"));
        assert_eq!(explanation.path, "tokens[0].dark");
    }

    #[test]
    fn names_a_token_that_declares_neither_the_requested_mode_nor_a_default() {
        let explanation = explain(vec![token("Color", vec![("light", color(0xffffffff))])]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenModeUnresolved
        );
        assert_eq!(explanation.mode.as_deref(), Some("dark"));
        assert_eq!(explanation.token_key.as_deref(), Some("a.token"));
    }

    #[test]
    fn names_an_alias_whose_target_no_token_declares() {
        let explanation = explain(vec![keyed_token(
            "color.card",
            "Color",
            vec![("default", text("$color.absent"))],
        )]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenUnresolved
        );
        assert_eq!(explanation.token_key.as_deref(), Some("color.absent"));
    }

    #[test]
    fn names_an_alias_cycle_instead_of_following_it_forever() {
        let explanation = explain(vec![
            keyed_token("a", "Color", vec![("default", text("$b"))]),
            keyed_token("b", "Color", vec![("default", text("$a"))]),
        ]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenReferenceCycle
        );
    }

    #[test]
    fn names_a_self_referential_token_as_a_cycle() {
        let explanation = explain(vec![keyed_token(
            "a",
            "Color",
            vec![("default", text("$a"))],
        )]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenReferenceCycle
        );
        assert_eq!(explanation.token_key.as_deref(), Some("a"));
    }

    #[test]
    fn names_an_alias_whose_target_is_a_different_kind() {
        let explanation = explain(vec![
            keyed_token(
                "color.card",
                "Color",
                vec![("default", text("$space.gutter"))],
            ),
            keyed_token("space.gutter", "Number", vec![("default", number(8.0))]),
        ]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenKindMismatch
        );
        assert_eq!(explanation.token_key.as_deref(), Some("space.gutter"));
    }

    #[test]
    fn names_a_malformed_reference_rather_than_treating_it_as_an_ordinary_string() {
        let explanation = explain(vec![keyed_token(
            "a",
            "String",
            vec![("default", text("$9lives"))],
        )]);
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenReferenceInvalid
        );
    }

    #[test]
    fn reports_nothing_when_every_token_resolves() {
        let registry = create_flight_document_token_resolver_registry();
        let scene = scene_with_tokens(vec![token("Color", vec![("default", color(0x3366ccff))])]);
        assert!(
            explain_flight_document_scene_token_resolution(&scene, "dark", Some(&registry))
                .is_none()
        );
    }
}

mod initialize_flight_document_token_resolver_registry {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flight_document_token_resolver_registry() {
        let mut registry: FlightDocumentTokenResolverRegistry = allocate_entity();
        let id = get_entity_id(&registry);
        assert!(registry.resolvers.key_order.is_empty());
        initialize_flight_document_token_resolver_registry(&mut registry);
        assert_eq!(
            registry.resolvers.key_order,
            vec!["Boolean", "Color", "Number", "String"]
        );
        assert_eq!(get_entity_id(&registry), id);
    }
}

mod resolve_flight_document_scene_tokens {
    use super::*;

    fn resolve(
        tokens: Vec<FlightDocumentToken>,
        mode: &str,
    ) -> Option<flight_scene_document::FlightDocumentTokenResolution> {
        let registry = create_flight_document_token_resolver_registry();
        return resolve_flight_document_scene_tokens(
            &scene_with_tokens(tokens),
            mode,
            Some(&registry),
        );
    }

    fn value_of(
        resolution: &flight_scene_document::FlightDocumentTokenResolution,
        key: &str,
    ) -> FlightDocumentValue {
        return get_record_value(&resolution.values, key)
            .expect("a resolved key")
            .clone();
    }

    #[test]
    fn prefers_the_requested_mode_over_the_default() {
        let resolution = resolve(
            vec![token(
                "Color",
                vec![
                    ("dark", color(0x1a1a1aff)),
                    ("default", color(0x808080ff)),
                    ("light", color(0xffffffff)),
                ],
            )],
            "dark",
        )
        .unwrap();
        assert_eq!(resolution.mode, "dark");
        assert!(fields_equal(
            &resolution.values,
            &fields(vec![("a.token", color(0x1a1a1aff))])
        ));
    }

    #[test]
    fn falls_back_to_the_default_mode_when_the_requested_one_is_absent() {
        let resolution = resolve(
            vec![token(
                "Color",
                vec![("default", color(0x808080ff)), ("light", color(0xffffffff))],
            )],
            "dark",
        )
        .unwrap();
        assert!(fields_equal(
            &resolution.values,
            &fields(vec![("a.token", color(0x808080ff))])
        ));
    }

    #[test]
    fn resolves_an_alias_inside_the_requested_mode_rather_than_through_the_target_default() {
        let tokens = || {
            return vec![
                keyed_token(
                    "color.card",
                    "Color",
                    vec![("default", text("$color.background"))],
                ),
                keyed_token(
                    "color.background",
                    "Color",
                    vec![("dark", color(0x1a1a1aff)), ("light", color(0xffffffff))],
                ),
            ];
        };
        assert!(value_equal(
            &value_of(&resolve(tokens(), "dark").unwrap(), "color.card"),
            &color(0x1a1a1aff)
        ));
        assert!(value_equal(
            &value_of(&resolve(tokens(), "light").unwrap(), "color.card"),
            &color(0xffffffff)
        ));
    }

    #[test]
    fn follows_an_alias_chain_to_its_concrete_value() {
        let resolution = resolve(
            vec![
                keyed_token("a", "Color", vec![("default", text("$b"))]),
                keyed_token("b", "Color", vec![("default", text("$c"))]),
                keyed_token("c", "Color", vec![("default", color(0x3366ccff))]),
            ],
            "dark",
        )
        .unwrap();
        assert!(fields_equal(
            &resolution.values,
            &fields(vec![
                ("a", color(0x3366ccff)),
                ("b", color(0x3366ccff)),
                ("c", color(0x3366ccff))
            ])
        ));
    }

    #[test]
    fn resolves_an_escaped_literal_dollar_sign_instead_of_looking_it_up() {
        let resolution = resolve(
            vec![keyed_token(
                "price.label",
                "String",
                vec![("default", text("$$5.00"))],
            )],
            "dark",
        )
        .unwrap();
        assert!(value_equal(
            &value_of(&resolution, "price.label"),
            &text("$5.00")
        ));
    }

    #[test]
    fn resolves_an_empty_token_section_to_an_empty_table_rather_than_refusing() {
        let resolution = resolve(vec![], "dark").unwrap();
        assert_eq!(resolution.mode, "dark");
        assert!(fields_equal(&resolution.values, &fields(vec![])));
    }

    #[test]
    fn returns_null_wherever_the_explain_seam_reports_a_refusal() {
        assert!(
            resolve(
                vec![token("Color", vec![("dark", text("midnight"))])],
                "dark"
            )
            .is_none()
        );
    }

    #[test]
    fn refuses_every_kind_when_no_resolver_registry_is_supplied() {
        let scene = scene_with_tokens(vec![token("Color", vec![("default", number(1.0))])]);
        assert!(resolve_flight_document_scene_tokens(&scene, "dark", None).is_none());
    }
}
