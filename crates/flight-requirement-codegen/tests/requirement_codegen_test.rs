use flight_entity::{Entity, get_entity_uid, has_entity_runtime, set_entity_uid};
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};
use flight_requirement_catalog::{
    RequirementCatalog, RequirementCatalogEntry, RequirementDisposition, RequirementTranslation,
    create_requirement_catalog,
};
use flight_requirement_codegen::contract::*;

fn catalog(
    entries: &[RequirementCatalogEntry],
    translations: &[RequirementTranslation],
    dispositions: &[RequirementDisposition],
) -> RequirementCatalog {
    return create_requirement_catalog(entries, translations, dispositions);
}

fn disposition(
    backend: &str,
    facet: RequirementFacet,
    kind: &str,
    reason: &str,
) -> RequirementDisposition {
    return RequirementDisposition {
        backend: backend.to_string(),
        facet,
        kind: kind.to_string(),
        reason: reason.to_string(),
    };
}

fn entry(
    backend: &str,
    facet: RequirementFacet,
    kind: &str,
    implementation_symbol: &str,
) -> RequirementCatalogEntry {
    return RequirementCatalogEntry {
        backend: backend.to_string(),
        content_parser_input_kind: None,
        facet,
        family_order: None,
        implementation_import: "@flighthq/test-backend".to_string(),
        implementation_symbol: implementation_symbol.to_string(),
        kind: kind.to_string(),
        parser_export: None,
        parser_field: None,
        registrar_import: None,
        registrar_symbol: None,
    };
}

fn requirement(facet: RequirementFacet, key: &str) -> Requirement {
    return Requirement {
        facet,
        key: key.to_string(),
    };
}

fn requirement_set(requirements: &[Requirement]) -> RequirementSet {
    let mut out = create_requirement_set(&[], &[]);
    out.covers = vec![
        RequirementFacet::DocumentFormat,
        RequirementFacet::SceneMaterialKind,
        RequirementFacet::SceneNodeKind,
    ];
    out.requirements = requirements.to_vec();
    return out;
}

fn translation(
    from_facet: RequirementFacet,
    from_key: &str,
    to: &[Requirement],
) -> RequirementTranslation {
    return RequirementTranslation {
        from: requirement(from_facet, from_key),
        to: to.to_vec(),
    };
}

mod create_requirement_codegen_plan {
    use super::*;

    #[test]
    fn accepts_catalogs_without_optional_translation_or_disposition_arrays() {
        let catalog = RequirementCatalog {
            backends: None,
            dispositions: None,
            entries: Vec::new(),
            translations: None,
        };
        let plan = create_requirement_codegen_plan(
            &catalog,
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Shape")]),
            "webgl",
        );
        assert!(plan.declined.is_empty());
        assert_eq!(
            plan.unresolved,
            vec![requirement(RequirementFacet::SceneNodeKind, "Shape")]
        );
    }

    #[test]
    fn applies_exact_and_namespace_translations_additively_in_source_order() {
        let entries = vec![
            entry(
                "webgl",
                RequirementFacet::SceneNodeKind,
                "MovieClip",
                "movieClipRenderer",
            ),
            entry(
                "webgl",
                RequirementFacet::DocumentFormat,
                "swf.SetBackgroundColor",
                "setBackgroundColorParser",
            ),
            entry(
                "webgl",
                RequirementFacet::SceneMaterialKind,
                "StandardPbr",
                "standardPbrRenderer",
            ),
            entry(
                "webgl",
                RequirementFacet::SceneNodeKind,
                "Shape",
                "shapeRenderer",
            ),
            entry(
                "webgl",
                RequirementFacet::DocumentFormat,
                "dae.Material",
                "daeMaterialParser",
            ),
        ];
        let translations = vec![
            translation(
                RequirementFacet::DocumentFormat,
                "swf.SetBackgroundColor",
                &[requirement(RequirementFacet::SceneNodeKind, "Shape")],
            ),
            translation(
                RequirementFacet::DocumentFormat,
                "swf",
                &[requirement(RequirementFacet::SceneNodeKind, "MovieClip")],
            ),
            translation(
                RequirementFacet::DocumentFormat,
                "dae",
                &[requirement(
                    RequirementFacet::SceneMaterialKind,
                    "StandardPbr",
                )],
            ),
        ];
        let plan = create_requirement_codegen_plan(
            &catalog(&entries, &translations, &[]),
            &requirement_set(&[
                requirement(RequirementFacet::DocumentFormat, "swf.SetBackgroundColor"),
                requirement(RequirementFacet::DocumentFormat, "dae.Material"),
            ]),
            "webgl",
        );
        assert_eq!(
            plan.entries
                .iter()
                .map(|row| row.implementation_symbol.as_str())
                .collect::<Vec<_>>(),
            vec![
                "setBackgroundColorParser",
                "daeMaterialParser",
                "shapeRenderer",
                "movieClipRenderer",
                "standardPbrRenderer",
            ]
        );
        assert!(plan.unresolved.is_empty());
    }

    #[test]
    fn deduplicates_repeated_positive_requirements_without_treating_covers_as_requests() {
        let shape_renderer = entry(
            "webgl",
            RequirementFacet::SceneNodeKind,
            "Shape",
            "glShapeRenderer",
        );
        let shape = requirement(RequirementFacet::SceneNodeKind, "Shape");
        let requirements = requirement_set(&[shape.clone(), shape]);
        let plan = create_requirement_codegen_plan(
            &catalog(&[shape_renderer.clone()], &[], &[]),
            &requirements,
            "webgl",
        );
        assert_eq!(plan.entries, vec![shape_renderer]);
        assert!(plan.unresolved.is_empty());
    }

    #[test]
    fn does_not_apply_a_disposition_to_another_backend() {
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[],
                &[],
                &[disposition(
                    "dom",
                    RequirementFacet::SceneNodeKind,
                    "Tilemap",
                    "no DOM tilemap path",
                )],
            ),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Tilemap")]),
            "canvas",
        );
        assert!(plan.declined.is_empty());
        assert_eq!(
            plan.unresolved,
            vec![requirement(RequirementFacet::SceneNodeKind, "Tilemap")]
        );
    }

    #[test]
    fn does_not_apply_a_disposition_to_another_facet() {
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[],
                &[],
                &[disposition(
                    "dom",
                    RequirementFacet::DocumentFormat,
                    "Tilemap",
                    "no DOM tilemap path",
                )],
            ),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Tilemap")]),
            "dom",
        );
        assert!(plan.declined.is_empty());
        assert_eq!(
            plan.unresolved,
            vec![requirement(RequirementFacet::SceneNodeKind, "Tilemap")]
        );
    }

    #[test]
    fn does_not_apply_a_disposition_to_another_kind() {
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[],
                &[],
                &[disposition(
                    "dom",
                    RequirementFacet::SceneNodeKind,
                    "Tilemap",
                    "no DOM tilemap path",
                )],
            ),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "QuadBatch")]),
            "dom",
        );
        assert!(plan.declined.is_empty());
        assert_eq!(
            plan.unresolved,
            vec![requirement(RequirementFacet::SceneNodeKind, "QuadBatch")]
        );
    }

    #[test]
    fn does_not_recurse_through_translated_requirements() {
        let translations = vec![
            translation(
                RequirementFacet::DocumentFormat,
                "swf",
                &[requirement(RequirementFacet::SceneNodeKind, "MovieClip")],
            ),
            translation(
                RequirementFacet::SceneNodeKind,
                "MovieClip",
                &[requirement(RequirementFacet::SceneMaterialKind, "Normal")],
            ),
        ];
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[entry(
                    "webgl",
                    RequirementFacet::SceneMaterialKind,
                    "Normal",
                    "normalMaterial",
                )],
                &translations,
                &[],
            ),
            &requirement_set(&[requirement(RequirementFacet::DocumentFormat, "swf.Tag")]),
            "webgl",
        );
        assert!(plan.entries.is_empty());
        assert_eq!(
            plan.unresolved,
            vec![
                requirement(RequirementFacet::DocumentFormat, "swf.Tag"),
                requirement(RequirementFacet::SceneNodeKind, "MovieClip"),
            ]
        );
    }

    #[test]
    fn emits_no_entry_for_a_declined_requirement() {
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[],
                &[],
                &[disposition(
                    "dom",
                    RequirementFacet::SceneNodeKind,
                    "Tilemap",
                    "no DOM tilemap path",
                )],
            ),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Tilemap")]),
            "dom",
        );
        assert!(plan.entries.is_empty());
    }

    #[test]
    fn implements_entity_for_the_source_entity_runtime_key_slot() {
        fn assert_entity<T: Entity>(_value: &T) {}

        let plan = create_requirement_codegen_plan(
            &catalog(&[], &[], &[]),
            &requirement_set(&[]),
            "webgl",
        );
        assert_entity(&plan);
        assert!(!has_entity_runtime(&plan));
    }

    #[test]
    fn keeps_requirements_with_embedded_nul_bytes_distinct() {
        let first = entry(
            "webgl",
            RequirementFacet::SceneNodeKind,
            "Shape\0Sprite",
            "combinedRenderer",
        );
        let second = entry(
            "webgl",
            RequirementFacet::SceneNodeKind,
            "Shape",
            "shapeRenderer",
        );
        let plan = create_requirement_codegen_plan(
            &catalog(&[first.clone(), second.clone()], &[], &[]),
            &requirement_set(&[
                requirement(RequirementFacet::SceneNodeKind, "Shape\0Sprite"),
                requirement(RequirementFacet::SceneNodeKind, "Shape"),
            ]),
            "webgl",
        );
        assert_eq!(plan.entries, vec![first, second]);
    }

    #[test]
    fn leaves_an_undisposed_gap_unresolved() {
        let plan = create_requirement_codegen_plan(
            &catalog(&[], &[], &[]),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Tilemap")]),
            "dom",
        );
        assert!(plan.declined.is_empty());
        assert_eq!(
            plan.unresolved,
            vec![requirement(RequirementFacet::SceneNodeKind, "Tilemap")]
        );
    }

    #[test]
    fn never_lets_a_disposition_override_a_resolving_row() {
        let row = entry(
            "dom",
            RequirementFacet::SceneNodeKind,
            "Tilemap",
            "domTilemapRenderer",
        );
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[row.clone()],
                &[],
                &[disposition(
                    "dom",
                    RequirementFacet::SceneNodeKind,
                    "Tilemap",
                    "stale decision",
                )],
            ),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Tilemap")]),
            "dom",
        );
        assert_eq!(plan.entries, vec![row]);
        assert!(plan.declined.is_empty());
        assert!(plan.unresolved.is_empty());
    }

    #[test]
    fn reports_one_requirement_declined_and_another_missing_in_order() {
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[],
                &[],
                &[disposition(
                    "dom",
                    RequirementFacet::SceneNodeKind,
                    "Tilemap",
                    "no DOM tilemap path",
                )],
            ),
            &requirement_set(&[
                requirement(RequirementFacet::SceneNodeKind, "Tilemap"),
                requirement(RequirementFacet::SceneNodeKind, "QuadBatch"),
            ]),
            "dom",
        );
        assert_eq!(plan.declined[0].requirement.key, "Tilemap");
        assert_eq!(plan.unresolved[0].key, "QuadBatch");
    }

    #[test]
    fn returns_an_empty_plan_for_empty_catalog_contents_and_requirements() {
        let plan = create_requirement_codegen_plan(
            &catalog(&[], &[], &[]),
            &requirement_set(&[]),
            "webgl",
        );
        assert_eq!(plan.backend, "webgl");
        assert!(plan.declined.is_empty());
        assert!(plan.entries.is_empty());
        assert!(plan.unresolved.is_empty());
    }

    #[test]
    fn routes_a_disposed_requirement_to_declined_with_the_first_reason() {
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[],
                &[],
                &[
                    disposition(
                        "dom",
                        RequirementFacet::SceneNodeKind,
                        "Tilemap",
                        "first decision",
                    ),
                    disposition(
                        "dom",
                        RequirementFacet::SceneNodeKind,
                        "Tilemap",
                        "later decision",
                    ),
                ],
            ),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Tilemap")]),
            "dom",
        );
        assert!(plan.unresolved.is_empty());
        assert_eq!(
            plan.declined,
            vec![RequirementDeclination {
                reason: "first decision".to_string(),
                requirement: requirement(RequirementFacet::SceneNodeKind, "Tilemap"),
            }]
        );
    }

    #[test]
    fn selects_matching_backend_rows_in_requirement_and_catalog_order() {
        let shape_renderer = entry(
            "webgl",
            RequirementFacet::SceneNodeKind,
            "Shape",
            "glShapeRenderer",
        );
        let mut shape_commands = shape_renderer.clone();
        shape_commands.implementation_symbol = "registerGlShapeCommands".to_string();
        shape_commands.registrar_import = Some("@flighthq/scene2d-gl".to_string());
        shape_commands.registrar_symbol = Some("registerGlShapeCommands".to_string());
        let mut webgpu_renderer = shape_renderer.clone();
        webgpu_renderer.backend = "webgpu".to_string();
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[
                    shape_renderer.clone(),
                    shape_commands.clone(),
                    webgpu_renderer,
                ],
                &[],
                &[],
            ),
            &requirement_set(&[
                requirement(RequirementFacet::SceneNodeKind, "Shape"),
                requirement(RequirementFacet::SceneNodeKind, "Sprite"),
            ]),
            "webgl",
        );
        assert_eq!(plan.backend, "webgl");
        assert_eq!(plan.entries, vec![shape_renderer, shape_commands]);
        assert_eq!(
            plan.unresolved,
            vec![requirement(RequirementFacet::SceneNodeKind, "Sprite")]
        );
    }

    #[test]
    fn translation_outputs_are_deduplicated_after_the_original_requirements() {
        let movie_clip = entry(
            "webgl",
            RequirementFacet::SceneNodeKind,
            "MovieClip",
            "movieClipRenderer",
        );
        let document = entry(
            "webgl",
            RequirementFacet::DocumentFormat,
            "swf.Tag",
            "tagParser",
        );
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[movie_clip.clone(), document.clone()],
                &[translation(
                    RequirementFacet::DocumentFormat,
                    "swf",
                    &[requirement(RequirementFacet::SceneNodeKind, "MovieClip")],
                )],
                &[],
            ),
            &requirement_set(&[
                requirement(RequirementFacet::SceneNodeKind, "MovieClip"),
                requirement(RequirementFacet::DocumentFormat, "swf.Tag"),
            ]),
            "webgl",
        );
        assert_eq!(plan.entries, vec![movie_clip, document]);
    }

    #[test]
    fn translations_require_an_exact_source_facet() {
        let plan = create_requirement_codegen_plan(
            &catalog(
                &[],
                &[translation(
                    RequirementFacet::SceneNodeKind,
                    "swf",
                    &[requirement(RequirementFacet::SceneNodeKind, "MovieClip")],
                )],
                &[],
            ),
            &requirement_set(&[requirement(RequirementFacet::DocumentFormat, "swf.Tag")]),
            "webgl",
        );
        assert_eq!(
            plan.unresolved,
            vec![requirement(RequirementFacet::DocumentFormat, "swf.Tag")]
        );
    }
}

mod initialize_requirement_codegen_plan {
    use super::*;

    #[test]
    fn replaces_plan_fields_without_replacing_the_entity_runtime() {
        let mut out = create_requirement_codegen_plan(
            &catalog(&[], &[], &[]),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Old")]),
            "old",
        );
        set_entity_uid(&mut out, "requirement-plan".to_string());
        let row = entry(
            "webgl",
            RequirementFacet::SceneNodeKind,
            "Shape",
            "shapeRenderer",
        );
        initialize_requirement_codegen_plan(
            &mut out,
            &catalog(&[row.clone()], &[], &[]),
            &requirement_set(&[requirement(RequirementFacet::SceneNodeKind, "Shape")]),
            "webgl",
        );
        assert_eq!(get_entity_uid(&mut out), "requirement-plan");
        assert_eq!(out.backend, "webgl");
        assert!(out.declined.is_empty());
        assert_eq!(out.entries, vec![row]);
        assert!(out.unresolved.is_empty());
    }
}
