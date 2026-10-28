//! flight-compiler: readonly-fields Requirement RequirementSet
//! flight-compiler: string-union RequirementFacet=exact
//! flight-compiler: string-union-value RequirementFacet CompressionKind "compression.kind"
//! flight-compiler: string-union-value RequirementFacet DocumentFormat "document.format"
//! flight-compiler: string-union-value RequirementFacet Physics2DJointKind "physics2d.joint-kind"
//! flight-compiler: string-union-value RequirementFacet SceneBlendMode "scene.blend-mode"
//! flight-compiler: string-union-value RequirementFacet SceneMaterialKind "scene.material-kind"
//! flight-compiler: string-union-value RequirementFacet SceneModifierKind "scene.modifier-kind"
//! flight-compiler: string-union-value RequirementFacet SceneNodeKind "scene.node-kind"
//! flight-compiler: string-union-value RequirementFacet SceneResourceMimeType "scene.resource-mime-type"
//! flight-compiler: string-union-value RequirementFacet SceneShapeCommand "scene.shape-command"
//! flight-compiler: string-union-value RequirementFacet SceneTextureSourceKind "scene.texture-source-kind"

use flight_entity::EntityRuntimeSlot;

/// The exact requirement facet string union from pinned TypeScript.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[repr(u8)]
pub enum RequirementFacet {
    CompressionKind = 0,
    DocumentFormat = 1,
    Physics2DJointKind = 2,
    SceneBlendMode = 3,
    SceneMaterialKind = 4,
    SceneModifierKind = 5,
    SceneNodeKind = 6,
    SceneResourceMimeType = 7,
    SceneShapeCommand = 8,
    SceneTextureSourceKind = 9,
}

/// One producer fact. It carries content vocabulary only, never backend or registry identity.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Requirement {
    pub facet: RequirementFacet,
    pub key: String,
}

/// A canonical set of producer facts and the facets for which missing facts prove absence.
#[derive(Clone, Debug, PartialEq)]
pub struct RequirementSet {
    pub covers: Vec<RequirementFacet>,
    pub requirements: Vec<Requirement>,
    runtime: EntityRuntimeSlot,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS RequirementFacet const and string union
pub fn get_requirement_facet_string(value: RequirementFacet) -> &'static str {
    return match value {
        RequirementFacet::CompressionKind => "compression.kind",
        RequirementFacet::DocumentFormat => "document.format",
        RequirementFacet::Physics2DJointKind => "physics2d.joint-kind",
        RequirementFacet::SceneBlendMode => "scene.blend-mode",
        RequirementFacet::SceneMaterialKind => "scene.material-kind",
        RequirementFacet::SceneModifierKind => "scene.modifier-kind",
        RequirementFacet::SceneNodeKind => "scene.node-kind",
        RequirementFacet::SceneResourceMimeType => "scene.resource-mime-type",
        RequirementFacet::SceneShapeCommand => "scene.shape-command",
        RequirementFacet::SceneTextureSourceKind => "scene.texture-source-kind",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS RequirementFacet const and string union
pub fn parse_requirement_facet(value: &str) -> Option<RequirementFacet> {
    return match value {
        "compression.kind" => Some(RequirementFacet::CompressionKind),
        "document.format" => Some(RequirementFacet::DocumentFormat),
        "physics2d.joint-kind" => Some(RequirementFacet::Physics2DJointKind),
        "scene.blend-mode" => Some(RequirementFacet::SceneBlendMode),
        "scene.material-kind" => Some(RequirementFacet::SceneMaterialKind),
        "scene.modifier-kind" => Some(RequirementFacet::SceneModifierKind),
        "scene.node-kind" => Some(RequirementFacet::SceneNodeKind),
        "scene.resource-mime-type" => Some(RequirementFacet::SceneResourceMimeType),
        "scene.shape-command" => Some(RequirementFacet::SceneShapeCommand),
        "scene.texture-source-kind" => Some(RequirementFacet::SceneTextureSourceKind),
        _ => None,
    };
}

impl Default for RequirementSet {
    fn default() -> Self {
        return RequirementSet {
            covers: Vec::new(),
            requirements: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

flight_entity::impl_entity!(RequirementSet);
