use flight_requirement::contract::*;

mod get_requirement_facet_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_facet_string() {
        let cases = [
            (RequirementFacet::CompressionKind, "compression.kind"),
            (RequirementFacet::DocumentFormat, "document.format"),
            (RequirementFacet::Physics2DJointKind, "physics2d.joint-kind"),
            (RequirementFacet::SceneBlendMode, "scene.blend-mode"),
            (RequirementFacet::SceneMaterialKind, "scene.material-kind"),
            (RequirementFacet::SceneModifierKind, "scene.modifier-kind"),
            (RequirementFacet::SceneNodeKind, "scene.node-kind"),
            (
                RequirementFacet::SceneResourceMimeType,
                "scene.resource-mime-type",
            ),
            (RequirementFacet::SceneShapeCommand, "scene.shape-command"),
            (
                RequirementFacet::SceneTextureSourceKind,
                "scene.texture-source-kind",
            ),
        ];
        for (facet, string) in cases {
            assert_eq!(get_requirement_facet_string(facet), string);
        }
    }
}

mod parse_requirement_facet {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let facets = [
            RequirementFacet::CompressionKind,
            RequirementFacet::DocumentFormat,
            RequirementFacet::Physics2DJointKind,
            RequirementFacet::SceneBlendMode,
            RequirementFacet::SceneMaterialKind,
            RequirementFacet::SceneModifierKind,
            RequirementFacet::SceneNodeKind,
            RequirementFacet::SceneResourceMimeType,
            RequirementFacet::SceneShapeCommand,
            RequirementFacet::SceneTextureSourceKind,
        ];
        for facet in facets {
            assert_eq!(
                parse_requirement_facet(get_requirement_facet_string(facet)),
                Some(facet)
            );
        }
        assert_eq!(parse_requirement_facet("SceneNodeKind"), None);
        assert_eq!(parse_requirement_facet(""), None);
    }
}
