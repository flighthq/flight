use std::sync::{Arc, RwLock};

use flight_adjustments::contract::*;
use flight_entity::Ref;
use flight_unhomed::*;

fn to_adjustment_ref<T: Adjustment + 'static>(adjustment: T) -> Ref<dyn Adjustment> {
    return Arc::new(RwLock::new(adjustment));
}

mod is_affine_color_matrix {
    use super::*;

    #[test]
    fn is_true_for_a_diagonal_identity_matrix() {
        assert!(is_affine_color_matrix(&create_identity_color_matrix()));
    }

    #[test]
    fn is_false_when_off_diagonal_channel_mixing_terms_are_present() {
        assert!(!is_affine_color_matrix(&create_saturation_color_matrix(0.0)));
    }
}

mod resolve_color_adjustments_color_matrix {
    use super::*;

    #[test]
    fn returns_the_complete_fused_matrix_for_matrix_tier_adjustments() {
        let saturation = create_saturation_color_matrix(0.0);
        let adjustment = create_color_matrix_adjustment(saturation);
        let result = resolve_color_adjustments_color_matrix(Some(&[to_adjustment_ref(adjustment)]));
        assert!(result.is_some());
        let fused = result.unwrap();
        for i in 0..20 {
            assert!((fused[i] - saturation[i]).abs() < 1e-6);
        }
    }

    #[test]
    fn returns_none_for_empty_stacks() {
        assert!(resolve_color_adjustments_color_matrix(Some(&[])).is_none());
    }

    #[test]
    fn returns_none_for_non_matrix_adjustments() {
        let lut = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(1.0), lightness: Some(0.0) }));
        assert!(resolve_color_adjustments_color_matrix(Some(&[to_adjustment_ref(lut)])).is_none());
    }
}

mod resolve_color_adjustments_color_scale_bias {
    use super::*;

    #[test]
    fn returns_none_for_a_null_or_empty_stack() {
        let mut out = create_color_scale_bias();
        assert_eq!(resolve_color_adjustments_color_scale_bias(None, &mut out), COLOR_ADJUSTMENT_NONE);
        assert_eq!(resolve_color_adjustments_color_scale_bias(Some(&[]), &mut out), COLOR_ADJUSTMENT_NONE);
    }

    #[test]
    fn resolves_a_single_generic_affine_matrix_exactly() {
        let matrix = [0.5, 0.0, 0.0, 0.0, 0.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let adjustment = create_color_matrix_adjustment(matrix);
        let mut out = create_color_scale_bias();
        assert_eq!(
            resolve_color_adjustments_color_scale_bias(Some(&[to_adjustment_ref(adjustment)]), &mut out),
            COLOR_ADJUSTMENT_AFFINE
        );
        assert_eq!(out.red_scale, 0.5);
        assert_eq!(out.green_scale, 0.0);
        assert!((out.red_bias - 0.4).abs() < 1e-6);
        assert_eq!(out.alpha_scale, 1.0);
    }

    #[test]
    fn fuses_two_affine_adjustments_multipliers_compose() {
        let matrix = [0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let a = create_color_matrix_adjustment(matrix);
        let b = create_color_matrix_adjustment(matrix);
        let mut out = create_color_scale_bias();
        assert_eq!(
            resolve_color_adjustments_color_scale_bias(Some(&[to_adjustment_ref(a), to_adjustment_ref(b)]), &mut out),
            COLOR_ADJUSTMENT_AFFINE
        );
        assert!((out.red_scale - 0.25).abs() < 1e-6);
    }

    #[test]
    fn reports_channel_mixing_for_an_off_diagonal_stack() {
        let saturation = create_color_matrix_adjustment(create_saturation_color_matrix(0.0));
        let mut out = create_color_scale_bias();
        assert_eq!(
            resolve_color_adjustments_color_scale_bias(Some(&[to_adjustment_ref(saturation)]), &mut out),
            COLOR_ADJUSTMENT_CHANNEL_MIXING
        );
        assert!((out.red_scale - 0.299).abs() < 1e-3);
    }

    #[test]
    fn reports_channel_mixing_when_a_non_matrix_lut_op_is_present() {
        let lut = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(1.0), lightness: Some(0.0) }));
        let mut out = create_color_scale_bias();
        assert_eq!(
            resolve_color_adjustments_color_scale_bias(Some(&[to_adjustment_ref(lut)]), &mut out),
            COLOR_ADJUSTMENT_CHANNEL_MIXING
        );
    }
}
