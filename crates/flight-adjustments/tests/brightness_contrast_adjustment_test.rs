use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_brightness_contrast_adjustment {
    use super::*;

    #[test]
    fn defaults_to_the_identity_brightness_0_contrast_1() {
        let adjustment = create_brightness_contrast_adjustment(None);
        assert_eq!(adjustment.kind, "BrightnessContrastAdjustment");
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0x3366aaff), 0x3366aaff);
    }

    #[test]
    fn scales_contrast_about_mid_grey_leaving_mid_grey_fixed() {
        let adjustment = create_brightness_contrast_adjustment(Some(&BrightnessContrastAdjustmentOptions { brightness: Some(0.0), contrast: Some(0.5) }));
        // 128 is the pivot -- unchanged; black lifts toward mid-grey (255*0.5*0.5 = 63.75 -> 64).
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0x808080ff), 0x808080ff);
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0x000000ff), 0x404040ff);
    }

    #[test]
    fn reproduces_the_prior_shader_rgb_plus_brightness_minus_half_times_contrast_plus_half() {
        // Scene3D values: brightness 0.15, contrast 0.35. White -> (1 + 0.15 - 0.5)*0.35 + 0.5 = 0.7275 -> 186.
        let adjustment = create_brightness_contrast_adjustment(Some(&BrightnessContrastAdjustmentOptions { brightness: Some(0.15), contrast: Some(0.35) }));
        assert_eq!(apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0xffffffff), 0xbababaff);
    }
}

mod initialize_brightness_contrast_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_brightness_contrast_adjustment() {
        let mut out: BrightnessContrastAdjustment = allocate_entity();
        initialize_brightness_contrast_adjustment(&mut out, Some(&BrightnessContrastAdjustmentOptions { brightness: Some(0.0), contrast: Some(1.0) }));
        assert_eq!(apply_color_matrix_to_color(&out.color_matrix.unwrap(), 0x3366aaff), 0x3366aaff);
    }
}
