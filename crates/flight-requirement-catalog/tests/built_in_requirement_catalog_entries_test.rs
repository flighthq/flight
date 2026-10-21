use flight_requirement::RequirementFacet;
use flight_requirement_catalog::*;

#[test]
fn preserves_every_generated_group_and_its_source_order() {
    assert_eq!(BUILT_IN_REQUIREMENT_CATALOG_ENTRIES.len(), 365);
    assert_eq!(BUILT_IN_REQUIREMENT_TRANSLATIONS.len(), 26);
    assert_eq!(BUILT_IN_REQUIREMENT_BACKENDS.len(), 4);
    assert_eq!(BUILT_IN_REQUIREMENT_DISPOSITIONS.len(), 115);

    let first = &BUILT_IN_REQUIREMENT_CATALOG_ENTRIES[0];
    assert_eq!(first.backend, "parser");
    assert_eq!(first.facet, RequirementFacet::DocumentFormat);
    assert_eq!(first.kind, "3ds.Camera");
    assert_eq!(first.family_order, Some(0));

    let last = &BUILT_IN_REQUIREMENT_CATALOG_ENTRIES[364];
    assert_eq!(last.backend, "wgpu");
    assert_eq!(last.facet, RequirementFacet::SceneShapeCommand);
    assert_eq!(last.kind, "quadraticCurveTo");

    assert_eq!(BUILT_IN_REQUIREMENT_BACKENDS[0].name, "canvas");
    assert_eq!(BUILT_IN_REQUIREMENT_BACKENDS[3].name, "wgpu");
    assert_eq!(
        BUILT_IN_REQUIREMENT_TRANSLATIONS[25].from.key,
        "swf.JPEGTables"
    );
    assert_eq!(BUILT_IN_REQUIREMENT_DISPOSITIONS[114].kind, "stl.Mesh");
}

#[test]
fn retains_direct_parser_and_family_metadata_as_inert_data() {
    let binary = BUILT_IN_REQUIREMENT_CATALOG_ENTRIES
        .iter()
        .find(|entry| entry.kind == "bitmapfont.BmFontBinary")
        .unwrap();
    assert_eq!(binary.parser_export.as_deref(), Some("contentParser"));
    assert_eq!(
        binary.content_parser_input_kind,
        Some(ContentParserInputKind::Bytes)
    );

    let spine = BUILT_IN_REQUIREMENT_CATALOG_ENTRIES
        .iter()
        .find(|entry| entry.parser_field.as_deref() == Some("timelineHandlers"))
        .unwrap();
    assert_eq!(spine.backend, "parser");
}
