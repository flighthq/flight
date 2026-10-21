use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_color_blind_simulation_adjustment {
    use super::*;

    #[test]
    fn defaults_to_deuteranopia_and_bakes_its_linear_matrix_preserving_alpha() {
        let adjustment = create_color_blind_simulation_adjustment(ColorBlindType::Deuteranopia);
        assert_eq!(adjustment.color_matrix.len(), 20);
        // Pure red under deuteranopia: R'=0.625*255~159, G'=0.7*255~179, B'=0; alpha preserved.
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0xff0000ff), 0x9fb300ff);
    }

    #[test]
    fn achromatopsia_collapses_to_equal_channel_luma_monochrome() {
        let adjustment = create_color_blind_simulation_adjustment(ColorBlindType::Achromatopsia);
        // Pure red -> 0.299*255~76 across all channels.
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix, 0xff0000ff), 0x4c4c4cff);
    }

    #[test]
    fn selects_a_distinct_matrix_per_type() {
        let protan = create_color_blind_simulation_adjustment(ColorBlindType::Protanopia);
        let tritan = create_color_blind_simulation_adjustment(ColorBlindType::Tritanopia);
        let green = 0x00ff00ff;
        assert_ne!(
            apply_color_matrix_to_color(&protan.color_matrix, green),
            apply_color_matrix_to_color(&tritan.color_matrix, green)
        );
    }
}

mod initialize_color_blind_simulation_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_blind_simulation_adjustment() {
        let mut out: ColorBlindSimulationAdjustment = allocate_entity();
        initialize_color_blind_simulation_adjustment(&mut out, ColorBlindType::Deuteranopia);
        assert_eq!(apply_color_matrix_to_color(&out.color_matrix, 0xff0000ff), 0x9fb300ff);
    }
}
