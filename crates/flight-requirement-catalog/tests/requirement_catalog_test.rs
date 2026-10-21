use std::sync::Arc;

use flight_requirement::RequirementFacet;
use flight_requirement_catalog::*;

fn first() -> RequirementCatalogEntry {
    return RequirementCatalogEntry {
        backend: "webgl".to_string(),
        facet: RequirementFacet::SceneNodeKind,
        implementation_import: "@flighthq/scene2d-gl".to_string(),
        implementation_symbol: "glShapeRenderer".to_string(),
        kind: "Shape".to_string(),
        family_order: None,
        parser_field: None,
        parser_export: None,
        content_parser_input_kind: None,
        registrar_import: Some("@flighthq/render".to_string()),
        registrar_symbol: Some("registerNodeRenderer".to_string()),
    };
}

fn populated() -> RequirementCatalogEntry {
    return RequirementCatalogEntry {
        backend: "webgl".to_string(),
        facet: RequirementFacet::DocumentFormat,
        implementation_import: "@flighthq/scene3d-formats".to_string(),
        implementation_symbol: "colladaGeometryDecoder".to_string(),
        kind: "dae.Geometry".to_string(),
        family_order: Some(3),
        parser_field: Some("decoders".to_string()),
        parser_export: Some("contentParser".to_string()),
        content_parser_input_kind: Some(ContentParserInputKind::String),
        registrar_import: Some("@flighthq/render".to_string()),
        registrar_symbol: Some("registerNodeRenderer".to_string()),
    };
}

fn shared(entries: Vec<RequirementCatalogEntry>) -> Vec<RequirementCatalogEntryRef> {
    return entries.into_iter().map(Arc::new).collect();
}

mod create_requirement_catalog {
    use super::*;

    #[test]
    fn carries_every_optional_field_through_the_copy() {
        let value = populated();
        assert_eq!(
            create_requirement_catalog(&[value.clone()], &[], &[]).entries,
            shared(vec![value])
        );
    }

    #[test]
    fn copies_dispositions_detached_from_the_caller() {
        let mut disposition = RequirementDisposition {
            backend: "dom".to_string(),
            facet: RequirementFacet::SceneMaterialKind,
            kind: "StandardPbr".to_string(),
            reason: "the DOM backend draws no lit surfaces".to_string(),
        };
        let catalog = create_requirement_catalog(&[], &[], &[disposition.clone()]);
        disposition.reason = "mutated".to_string();
        assert_eq!(
            catalog.dispositions.unwrap()[0].reason,
            "the DOM backend draws no lit surfaces"
        );
    }

    #[test]
    fn copies_translations_deeply() {
        let mut translation = RequirementTranslation {
            from: flight_requirement::Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: "dae.Material".to_string(),
            },
            to: vec![flight_requirement::Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: "StandardPbr".to_string(),
            }],
        };
        let catalog = create_requirement_catalog(&[], &[translation.clone()], &[]);
        translation.from.key = "mutated".to_string();
        translation.to[0].key = "mutated".to_string();
        let copied = &catalog.translations.unwrap()[0];
        assert_eq!(copied.from.key, "dae.Material");
        assert_eq!(copied.to[0].key, "StandardPbr");
    }

    #[test]
    fn creates_an_isolated_empty_catalog_and_copies_supplied_entries() {
        let mut source = vec![first()];
        let catalog = create_requirement_catalog(&source, &[], &[]);
        source.clear();
        assert_eq!(catalog.entries, shared(vec![first()]));
        assert!(create_requirement_catalog(&[], &[], &[]).entries.is_empty());
    }

    #[test]
    fn detaches_each_row_from_later_caller_mutation() {
        let mut source = populated();
        let catalog = create_requirement_catalog(&[source.clone()], &[], &[]);
        source.family_order = Some(99);
        source.implementation_symbol = "mutated".to_string();
        assert_eq!(catalog.entries, shared(vec![populated()]));
    }
}

mod find_requirement_catalog_entries {
    use super::*;

    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let catalog = create_requirement_catalog(&[first()], &[], &[]);
        let mut out = Vec::with_capacity(8);
        get_requirement_catalog_entries(&mut out, &catalog);

        find_requirement_catalog_entries(
            &mut out,
            &catalog,
            "none",
            RequirementFacet::SceneNodeKind,
            "Shape",
        );

        assert!(out.is_empty());
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn looks_up_every_row_by_backend_facet_and_kind_in_order() {
        let first = first();
        let mut second = first.clone();
        second.implementation_symbol = "secondShapeRenderer".to_string();
        second.registrar_symbol = Some("registerSecondNodeRenderer".to_string());
        let catalog = create_requirement_catalog(&[first.clone(), second.clone()], &[], &[]);
        assert_eq!(
            {
                let mut collected = Vec::new();
                find_requirement_catalog_entries(
                    &mut collected,
                    &catalog,
                    "webgl",
                    RequirementFacet::SceneNodeKind,
                    "Shape",
                );
                collected
            },
            shared(vec![first, second])
        );
        assert!(
            {
                let mut collected = Vec::new();
                find_requirement_catalog_entries(
                    &mut collected,
                    &catalog,
                    "webgpu",
                    RequirementFacet::SceneNodeKind,
                    "Shape",
                );
                collected
            }
            .is_empty()
        );
    }

    #[test]
    fn returns_every_optional_field_of_a_matched_row() {
        let value = populated();
        let catalog = create_requirement_catalog(&[value.clone()], &[], &[]);
        assert_eq!(
            {
                let mut collected = Vec::new();
                find_requirement_catalog_entries(
                    &mut collected,
                    &catalog,
                    "webgl",
                    RequirementFacet::DocumentFormat,
                    "dae.Geometry",
                );
                collected
            },
            shared(vec![value])
        );
    }
}

mod get_requirement_catalog_entries {
    use super::*;

    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let catalog = create_requirement_catalog(&[first()], &[], &[]);
        let mut out = Vec::with_capacity(8);
        get_requirement_catalog_entries(&mut out, &catalog);

        get_requirement_catalog_entries(&mut out, &catalog);

        assert_eq!(out.len(), 1);
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn returns_a_new_ordered_array_with_the_same_row_identity() {
        let catalog = create_requirement_catalog(&[first()], &[], &[]);
        let snapshot = {
            let mut collected = Vec::new();
            get_requirement_catalog_entries(&mut collected, &catalog);
            collected
        };
        assert!(Arc::ptr_eq(&snapshot[0], &catalog.entries[0]));
        assert_eq!(snapshot, shared(vec![first()]));
    }

    #[test]
    fn returns_every_optional_field_read_by_codegen() {
        let value = populated();
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_requirement_catalog_entries(
                    &mut collected,
                    &create_requirement_catalog(&[value.clone()], &[], &[]),
                );
                collected
            },
            shared(vec![value])
        );
    }
}

mod register_requirement_catalog_entry {
    use super::*;

    #[test]
    fn appends_a_new_row_with_every_optional_field() {
        let value = populated();
        let mut catalog = create_requirement_catalog(&[], &[], &[]);
        register_requirement_catalog_entry(&mut catalog, &value);
        assert_eq!(catalog.entries, shared(vec![populated()]));
    }

    #[test]
    fn embedded_nul_delimiter_collisions_overwrite_like_the_source_joined_identity() {
        let mut current = first();
        current.registrar_import = Some("pkg\0register".to_string());
        current.registrar_symbol = None;
        let mut replacement = current.clone();
        replacement.registrar_import = Some("pkg".to_string());
        replacement.registrar_symbol = Some("register\0".to_string());
        replacement.implementation_symbol = "replacement".to_string();

        let mut catalog = create_requirement_catalog(&[current], &[], &[]);
        register_requirement_catalog_entry(&mut catalog, &replacement);

        assert_eq!(catalog.entries, shared(vec![replacement]));
    }

    #[test]
    fn keeps_every_optional_field_when_replacing_a_row() {
        let mut old = populated();
        old.family_order = Some(0);
        let mut catalog = create_requirement_catalog(&[old], &[], &[]);
        register_requirement_catalog_entry(&mut catalog, &populated());
        assert_eq!(catalog.entries, shared(vec![populated()]));
    }

    #[test]
    fn preserves_multiple_registrars_for_one_requirement() {
        let first = first();
        let mut commands = first.clone();
        commands.registrar_import = Some("@flighthq/scene2d-gl".to_string());
        commands.registrar_symbol = Some("registerGlShapeCommands".to_string());
        let mut catalog = create_requirement_catalog(&[first.clone()], &[], &[]);
        register_requirement_catalog_entry(&mut catalog, &commands);
        assert_eq!(catalog.entries, shared(vec![first, commands]));
    }

    #[test]
    fn replaces_a_matching_identity_in_place_and_copies_caller_data() {
        let first = first();
        let mut replacement = first.clone();
        replacement.implementation_import = "@acme/gl".to_string();
        replacement.implementation_symbol = "defaultAcmeShapeRenderer".to_string();
        let mut catalog = create_requirement_catalog(&[first], &[], &[]);
        register_requirement_catalog_entry(&mut catalog, &replacement);
        replacement.implementation_symbol = "mutated".to_string();
        assert_eq!(
            catalog.entries[0].implementation_symbol,
            "defaultAcmeShapeRenderer"
        );
    }

    #[test]
    fn retains_previously_selected_row_identity_when_a_slot_is_replaced() {
        let original = first();
        let mut catalog = create_requirement_catalog(&[original], &[], &[]);
        let selected = {
            let mut collected = Vec::new();
            find_requirement_catalog_entries(
                &mut collected,
                &catalog,
                "webgl",
                RequirementFacet::SceneNodeKind,
                "Shape",
            );
            collected
        };
        let prior = selected[0].clone();
        let mut replacement = first();
        replacement.implementation_symbol = "replacementRenderer".to_string();
        register_requirement_catalog_entry(&mut catalog, &replacement);
        assert!(!Arc::ptr_eq(&prior, &catalog.entries[0]));
        assert_eq!(prior.implementation_symbol, "glShapeRenderer");
        assert_eq!(
            catalog.entries[0].implementation_symbol,
            "replacementRenderer"
        );
    }

    #[test]
    fn treats_absent_and_empty_registrar_fields_as_the_same_source_identity() {
        let mut current = first();
        current.registrar_import = None;
        current.registrar_symbol = None;
        let mut replacement = current.clone();
        replacement.registrar_import = Some(String::new());
        replacement.registrar_symbol = Some(String::new());
        replacement.implementation_symbol = "replacement".to_string();
        let mut catalog = create_requirement_catalog(&[current], &[], &[]);
        register_requirement_catalog_entry(&mut catalog, &replacement);
        assert_eq!(catalog.entries, shared(vec![replacement]));
    }
}

mod unregister_requirement_catalog_entry {
    use super::*;

    #[test]
    fn removes_only_the_requested_kind_and_registrar() {
        let first = first();
        let mut catalog = create_requirement_catalog(&[first.clone()], &[], &[]);
        let mut unknown = first.clone();
        unknown.registrar_symbol = Some("unknown".to_string());
        assert!(!unregister_requirement_catalog_entry(
            &mut catalog,
            &unknown
        ));
        assert!(unregister_requirement_catalog_entry(&mut catalog, &first));
        assert!(catalog.entries.is_empty());
    }
}
