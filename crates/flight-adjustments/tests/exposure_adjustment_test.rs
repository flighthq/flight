use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_exposure_adjustment {
    use super::*;

    #[test]
    fn defaults_to_the_identity_exposure_0() {
        let adjustment = create_exposure_adjustment(None);
        assert_eq!(adjustment.kind, "ExposureAdjustment");
        assert_eq!(
            apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0x204060ff),
            0x204060ff
        );
    }

    #[test]
    fn scales_rgb_by_2_to_the_exposure_preserving_alpha() {
        let adjustment = create_exposure_adjustment(Some(&ExposureAdjustmentOptions {
            exposure: Some(1.0),
        }));
        // Each channel doubles; alpha is untouched.
        assert_eq!(
            apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0x204060ff),
            0x4080c0ff
        );
    }

    #[test]
    fn clamps_to_sdr_0_1_for_the_default_pipeline() {
        let adjustment = create_exposure_adjustment(Some(&ExposureAdjustmentOptions {
            exposure: Some(1.0),
        }));
        // 0x80 doubled is 256 -> clamps to 255.
        assert_eq!(
            apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0x808080ff),
            0xffffffff
        );
    }
}

mod initialize_exposure_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_exposure_adjustment() {
        let mut out: ExposureAdjustment = allocate_entity();
        initialize_exposure_adjustment(
            &mut out,
            Some(&ExposureAdjustmentOptions {
                exposure: Some(0.0),
            }),
        );
        assert_eq!(
            apply_color_matrix_to_color(&out.color_matrix.unwrap(), 0x204060ff),
            0x204060ff
        );
    }
}
