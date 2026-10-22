use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_grayscale_adjustment {
    use super::*;

    #[test]
    fn defaults_to_full_bt709_luma_desaturation() {
        let adjustment = create_grayscale_adjustment(None);
        assert_eq!(adjustment.kind, "GrayscaleAdjustment");
        // Pure red -> luma 0.2126*255 ~ 54, equal across channels; alpha preserved.
        let out = apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0xff0000ff);
        let r = (out >> 24) & 0xff;
        let g = (out >> 16) & 0xff;
        let b = (out >> 8) & 0xff;
        assert_eq!(r, g);
        assert_eq!(g, b);
        assert_eq!(r, (0.2126_f32 * 255.0).round() as u32);
        assert_eq!(out & 0xff, 0xff);
    }

    #[test]
    fn intensity_0_leaves_color_unchanged() {
        let adjustment = create_grayscale_adjustment(Some(&GrayscaleAdjustmentOptions {
            intensity: Some(0.0),
        }));
        assert_eq!(
            apply_color_matrix_to_color(&adjustment.color_matrix.unwrap(), 0x2040a0ff),
            0x2040a0ff
        );
    }
}

mod initialize_grayscale_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_grayscale_adjustment() {
        let mut out: GrayscaleAdjustment = allocate_entity();
        initialize_grayscale_adjustment(
            &mut out,
            Some(&GrayscaleAdjustmentOptions {
                intensity: Some(1.0),
            }),
        );
        let result = apply_color_matrix_to_color(&out.color_matrix.unwrap(), 0xff0000ff);
        let r = (result >> 24) & 0xff;
        let g = (result >> 16) & 0xff;
        assert_eq!(r, g);
    }
}
