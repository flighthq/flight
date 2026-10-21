use flight_lighting::contract::*;

mod get_light_unit_string {
    use super::*;

    #[test]
    fn returns_the_exact_closed_table() {
        assert_eq!(get_light_unit_string(LightUnit::Candela), "Candela");
        assert_eq!(get_light_unit_string(LightUnit::Lumen), "Lumen");
        assert_eq!(get_light_unit_string(LightUnit::Lux), "Lux");
        assert_eq!(get_light_unit_string(LightUnit::Unitless), "Unitless");
    }
}

mod get_scene_3d_forward_light_selection_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_reason_table() {
        assert_eq!(
            get_scene_3d_forward_light_selection_reason_string(
                Scene3DForwardLightSelectionReason::SelectionPrepared
            ),
            "selection-prepared"
        );
        assert_eq!(
            get_scene_3d_forward_light_selection_reason_string(
                Scene3DForwardLightSelectionReason::SelectionRequired
            ),
            "selection-required"
        );
        assert_eq!(
            get_scene_3d_forward_light_selection_reason_string(
                Scene3DForwardLightSelectionReason::WithinBudget
            ),
            "within-budget"
        );
    }
}

mod parse_light_unit {
    use super::*;

    #[test]
    fn accepts_only_exact_casing() {
        assert_eq!(parse_light_unit("Candela"), Some(LightUnit::Candela));
        assert_eq!(parse_light_unit("candela"), None);
        assert_eq!(parse_light_unit("unknown"), None);
    }
}

mod parse_scene_3d_forward_light_selection_reason {
    use super::*;

    #[test]
    fn rejects_values_outside_the_closed_reason_union() {
        assert_eq!(
            parse_scene_3d_forward_light_selection_reason("within-budget"),
            Some(Scene3DForwardLightSelectionReason::WithinBudget)
        );
        assert_eq!(parse_scene_3d_forward_light_selection_reason("other"), None);
    }
}
