use flight_entity::Kind;

pub type ModifierKind = Kind;
pub type ModifierSlot = Kind;

pub const MODIFIER_SLOT_DIFFUSE: &str = "Diffuse";
pub const MODIFIER_SLOT_EFFECT: &str = "Effect";
pub const MODIFIER_SLOT_EMISSIVE: &str = "Emissive";
pub const MODIFIER_SLOT_NORMAL: &str = "Normal";
pub const MODIFIER_SLOT_SPECULAR: &str = "Specular";
pub const MODIFIER_SLOT_VERTEX: &str = "Vertex";

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum EmissiveModifierFacing {
    AwayFromLight,
    #[default]
    Ignore,
    TowardLight,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum FogModifierMode {
    Exponential,
    Exponential2,
    #[default]
    Linear,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum VertexDisplaceModifierSource {
    HeightMap,
    #[default]
    Sine,
}

// flight-lint: allow(conform-extra) D9e closed-enum string table for EmissiveModifierFacing
pub fn get_emissive_modifier_facing_string(value: EmissiveModifierFacing) -> &'static str {
    return match value {
        EmissiveModifierFacing::AwayFromLight => "AwayFromLight",
        EmissiveModifierFacing::Ignore => "Ignore",
        EmissiveModifierFacing::TowardLight => "TowardLight",
    };
}

// flight-lint: allow(conform-extra) D9e closed-enum string table for FogModifierMode
pub fn get_fog_modifier_mode_string(value: FogModifierMode) -> &'static str {
    return match value {
        FogModifierMode::Exponential => "Exponential",
        FogModifierMode::Exponential2 => "Exponential2",
        FogModifierMode::Linear => "Linear",
    };
}

// flight-lint: allow(conform-extra) D9e closed-enum string table for VertexDisplaceModifierSource
pub fn get_vertex_displace_modifier_source_string(
    value: VertexDisplaceModifierSource,
) -> &'static str {
    return match value {
        VertexDisplaceModifierSource::HeightMap => "HeightMap",
        VertexDisplaceModifierSource::Sine => "Sine",
    };
}

// flight-lint: allow(conform-extra) D9e closed-enum string table for EmissiveModifierFacing
pub fn parse_emissive_modifier_facing(value: &str) -> Option<EmissiveModifierFacing> {
    return match value {
        "AwayFromLight" => Some(EmissiveModifierFacing::AwayFromLight),
        "Ignore" => Some(EmissiveModifierFacing::Ignore),
        "TowardLight" => Some(EmissiveModifierFacing::TowardLight),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e closed-enum string table for FogModifierMode
pub fn parse_fog_modifier_mode(value: &str) -> Option<FogModifierMode> {
    return match value {
        "Exponential" => Some(FogModifierMode::Exponential),
        "Exponential2" => Some(FogModifierMode::Exponential2),
        "Linear" => Some(FogModifierMode::Linear),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e closed-enum string table for VertexDisplaceModifierSource
pub fn parse_vertex_displace_modifier_source(value: &str) -> Option<VertexDisplaceModifierSource> {
    return match value {
        "HeightMap" => Some(VertexDisplaceModifierSource::HeightMap),
        "Sine" => Some(VertexDisplaceModifierSource::Sine),
        _ => None,
    };
}
