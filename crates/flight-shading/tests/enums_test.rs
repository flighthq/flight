use flight_shading::contract::*;

mod get_emissive_modifier_facing_string {
    use super::*;

    #[test]
    fn returns_the_canonical_pascal_case_values() {
        assert_eq!(
            get_emissive_modifier_facing_string(EmissiveModifierFacing::AwayFromLight),
            "AwayFromLight"
        );
        assert_eq!(
            get_emissive_modifier_facing_string(EmissiveModifierFacing::Ignore),
            "Ignore"
        );
        assert_eq!(
            get_emissive_modifier_facing_string(EmissiveModifierFacing::TowardLight),
            "TowardLight"
        );
    }
}

mod get_fog_modifier_mode_string {
    use super::*;

    #[test]
    fn returns_the_canonical_pascal_case_values() {
        assert_eq!(
            get_fog_modifier_mode_string(FogModifierMode::Exponential),
            "Exponential"
        );
        assert_eq!(
            get_fog_modifier_mode_string(FogModifierMode::Exponential2),
            "Exponential2"
        );
        assert_eq!(
            get_fog_modifier_mode_string(FogModifierMode::Linear),
            "Linear"
        );
    }
}

mod get_vertex_displace_modifier_source_string {
    use super::*;

    #[test]
    fn returns_the_canonical_pascal_case_values() {
        assert_eq!(
            get_vertex_displace_modifier_source_string(VertexDisplaceModifierSource::HeightMap),
            "HeightMap"
        );
        assert_eq!(
            get_vertex_displace_modifier_source_string(VertexDisplaceModifierSource::Sine),
            "Sine"
        );
    }
}

mod parse_emissive_modifier_facing {
    use super::*;

    #[test]
    fn parses_known_values_and_rejects_unknown_values() {
        assert_eq!(
            parse_emissive_modifier_facing("AwayFromLight"),
            Some(EmissiveModifierFacing::AwayFromLight)
        );
        assert_eq!(parse_emissive_modifier_facing("away"), None);
    }
}

mod parse_fog_modifier_mode {
    use super::*;

    #[test]
    fn parses_known_values_and_rejects_unknown_values() {
        assert_eq!(
            parse_fog_modifier_mode("Exponential2"),
            Some(FogModifierMode::Exponential2)
        );
        assert_eq!(parse_fog_modifier_mode("linear"), None);
    }
}

mod parse_vertex_displace_modifier_source {
    use super::*;

    #[test]
    fn parses_known_values_and_rejects_unknown_values() {
        assert_eq!(
            parse_vertex_displace_modifier_source("Sine"),
            Some(VertexDisplaceModifierSource::Sine)
        );
        assert_eq!(parse_vertex_displace_modifier_source("noise"), None);
    }
}
