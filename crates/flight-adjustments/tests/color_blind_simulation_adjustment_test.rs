use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_color_blind_simulation_adjustment {
    use super::*;

    #[test]
    fn defaults_to_deuteranopia_and_bakes_its_linear_matrix_preserving_alpha() {
        let adjustment = create_color_blind_simulation_adjustment(None);
        assert_eq!(adjustment.kind, "ColorBlindSimulationAdjustment");
        assert_eq!(adjustment.color_matrix.unwrap().len(), 20);
        // Pure red under deuteranopia: R'=0.625*255~159, G'=0.7*255~179, B'=0; alpha preserved.
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0xff0000ff), 0x9fb300ff);
    }

    #[test]
    fn achromatopsia_collapses_to_equal_channel_luma_monochrome() {
        let adjustment = create_color_blind_simulation_adjustment(Some(&ColorBlindSimulationAdjustmentOptions { type_: Some(ColorBlindType::Achromatopsia) }));
        // Pure red -> 0.299*255~76 across all channels.
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0xff0000ff), 0x4c4c4cff);
    }

    #[test]
    fn selects_a_distinct_matrix_per_type() {
        let protan = create_color_blind_simulation_adjustment(Some(&ColorBlindSimulationAdjustmentOptions { type_: Some(ColorBlindType::Protanopia) }));
        let tritan = create_color_blind_simulation_adjustment(Some(&ColorBlindSimulationAdjustmentOptions { type_: Some(ColorBlindType::Tritanopia) }));
        let green = 0x00ff00ff;
        assert_ne!(
            apply_color_matrix_to_color(&protan.color_matrix.unwrap(), green),
            apply_color_matrix_to_color(&tritan.color_matrix.unwrap(), green)
        );
    }
}

mod get_color_blind_type_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_color_blind_type_string(ColorBlindType::Protanopia), "protanopia");
        assert_eq!(get_color_blind_type_string(ColorBlindType::Deuteranopia), "deuteranopia");
        assert_eq!(get_color_blind_type_string(ColorBlindType::Tritanopia), "tritanopia");
        assert_eq!(get_color_blind_type_string(ColorBlindType::Protanomaly), "protanomaly");
        assert_eq!(get_color_blind_type_string(ColorBlindType::Deuteranomaly), "deuteranomaly");
        assert_eq!(get_color_blind_type_string(ColorBlindType::Tritanomaly), "tritanomaly");
        assert_eq!(get_color_blind_type_string(ColorBlindType::Achromatopsia), "achromatopsia");
        assert_eq!(get_color_blind_type_string(ColorBlindType::Achromatomaly), "achromatomaly");
    }
}

mod initialize_color_blind_simulation_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_blind_simulation_adjustment() {
        let mut out: ColorBlindSimulationAdjustment = allocate_entity();
        initialize_color_blind_simulation_adjustment(&mut out, Some(&ColorBlindSimulationAdjustmentOptions { type_: Some(ColorBlindType::Deuteranopia) }));
        assert_eq!(apply_color_matrix_to_color(&out.color_matrix.unwrap(), 0xff0000ff), 0x9fb300ff);
    }
}

mod parse_color_blind_type {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_color_blind_type("protanopia"), Some(ColorBlindType::Protanopia));
        assert_eq!(parse_color_blind_type("deuteranopia"), Some(ColorBlindType::Deuteranopia));
        assert_eq!(parse_color_blind_type("tritanopia"), Some(ColorBlindType::Tritanopia));
        assert_eq!(parse_color_blind_type("protanomaly"), Some(ColorBlindType::Protanomaly));
        assert_eq!(parse_color_blind_type("deuteranomaly"), Some(ColorBlindType::Deuteranomaly));
        assert_eq!(parse_color_blind_type("tritanomaly"), Some(ColorBlindType::Tritanomaly));
        assert_eq!(parse_color_blind_type("achromatopsia"), Some(ColorBlindType::Achromatopsia));
        assert_eq!(parse_color_blind_type("achromatomaly"), Some(ColorBlindType::Achromatomaly));
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_color_blind_type("Deuteranopia"), None);
        assert_eq!(parse_color_blind_type(""), None);
    }
}
