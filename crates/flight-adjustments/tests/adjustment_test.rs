use std::sync::{Arc, RwLock};

use flight_adjustments::contract::*;
use flight_entity::Ref;

/// A foreign custom adjustment (TS Adjustment.test `AcmeDuotone`): its own struct composing
/// AdjustmentFields, declared outside the crate through impl_adjustment!.
#[derive(Debug, Clone, Default)]
struct AcmeDuotone {
    fields: AdjustmentFields,
    pub shadow: u32,
}

flight_adjustments::impl_adjustment!(AcmeDuotone, "shadow" => shadow);

fn create_acme_duotone(shadow: u32, color_matrix: Option<[f32; 20]>) -> AcmeDuotone {
    let mut out: AcmeDuotone = flight_entity::allocate_entity();
    initialize_adjustment(&mut out, "acme.Duotone");
    out.color_matrix = color_matrix;
    out.shadow = shadow;
    return out;
}

mod adjustment_family {
    use super::*;

    #[test]
    fn accepts_a_foreign_custom_adjustment_kind() {
        let adjustment = create_acme_duotone(0x000000ff, None);
        let base: &dyn Adjustment = &adjustment;
        assert_eq!(base.adjustment_fields().kind, "acme.Duotone");
    }

    #[test]
    fn accepts_any_string_kind() {
        let mut adjustment = create_acme_duotone(0, None);
        initialize_adjustment(&mut adjustment, "ColorScaleBiasAdjustment");
        assert_eq!(adjustment.kind, "ColorScaleBiasAdjustment");
    }

    #[test]
    fn fuses_a_custom_matrix_tier_kind_with_built_in_adjustments() {
        let identity = create_identity_color_matrix();
        let run: Vec<Ref<dyn Adjustment>> = vec![
            Arc::new(RwLock::new(create_acme_duotone(0, Some(identity)))),
            Arc::new(RwLock::new(create_invert_adjustment(None))),
        ];
        let fused = resolve_color_adjustments_color_matrix(Some(&run)).unwrap();
        assert_eq!(fused, *get_adjustment_color_matrix(&create_invert_adjustment(None)).unwrap());
    }

    #[test]
    fn treats_a_custom_kind_without_tier_fields_as_non_pointwise() {
        let adjustment = create_acme_duotone(7, None);
        assert!(get_adjustment_color_matrix(&adjustment).is_none());
        assert!(get_adjustment_color_transform(&adjustment).is_none());
        assert!(!is_color_matrix_adjustment(&adjustment));
        assert!(!is_color_lut_adjustment(&adjustment));
    }

    #[test]
    fn serializes_the_custom_kind_and_fields_for_the_cache_signature() {
        let adjustment = create_acme_duotone(255, None);
        let mut signature = String::new();
        adjustment.write_adjustment_signature(&mut signature);
        assert_eq!(signature, "{\"kind\":\"acme.Duotone\",\"shadow\":255}");
    }

    #[test]
    fn serializes_built_in_kinds_like_ts_json_stringify() {
        let mut exposure = String::new();
        create_exposure_adjustment(Some(&ExposureAdjustmentOptions { exposure: Some(1.0) })).write_adjustment_signature(&mut exposure);
        assert_eq!(
            exposure,
            "{\"kind\":\"ExposureAdjustment\",\"colorMatrix\":[2,0,0,0,0,0,2,0,0,0,0,0,2,0,0,0,0,0,1,0],\"exposure\":1}"
        );
        let mut grade = String::new();
        create_lookup_table_grade_adjustment(None).write_adjustment_signature(&mut grade);
        assert_eq!(grade, "{\"kind\":\"LookupTableGradeAdjustment\",\"strength\":1}");
        let mut blind = String::new();
        create_color_blind_simulation_adjustment(None).write_adjustment_signature(&mut blind);
        assert!(blind.ends_with(",\"type\":\"deuteranopia\"}"));
    }
}

mod initialize_adjustment {
    use super::*;

    #[test]
    fn sets_the_kind() {
        let mut adjustment = create_invert_adjustment(None);
        initialize_adjustment(&mut adjustment, "acme.Invert");
        assert_eq!(adjustment.kind, "acme.Invert");
        assert!(adjustment.color_matrix.is_some());
    }
}
