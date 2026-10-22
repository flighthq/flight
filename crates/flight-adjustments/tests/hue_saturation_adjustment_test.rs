use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod create_hue_saturation_adjustment {
    use super::*;

    #[test]
    fn defaults_to_the_identity_and_carries_a_fusable_transform() {
        let adj = create_hue_saturation_adjustment(None);
        assert_eq!(adj.kind, "HueSaturationAdjustment");
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        (get_adjustment_color_transform(&adj).unwrap())(&mut out, 0.2, 0.4, 0.6);
        assert!((out[0] - 0.2).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
        assert!((out[1] - 0.4).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
        assert!((out[2] - 0.6).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
    }

    #[test]
    fn fully_desaturates_to_luma_preserving_grey_at_saturation_0() {
        let adj = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions {
            hue: Some(0.0),
            saturation: Some(0.0),
            lightness: Some(0.0),
        }));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        (get_adjustment_color_transform(&adj).unwrap())(&mut out, 1.0, 0.0, 0.0);
        // HSL saturation 0 collapses to lightness grey (mid of max/min = 0.5).
        assert!((out[0] - 0.5).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
        assert!((out[0] - out[1]).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
        assert!((out[1] - out[2]).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
    }

    #[test]
    fn rotates_hue_by_120_degrees_mapping_red_toward_green() {
        let adj = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions {
            hue: Some(120.0),
            saturation: Some(1.0),
            lightness: Some(0.0),
        }));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        (get_adjustment_color_transform(&adj).unwrap())(&mut out, 1.0, 0.0, 0.0);
        assert!((out[1] - 1.0).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
        assert!((out[0] - 0.0).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
        assert!((out[2] - 0.0).abs() < 0.00005); // D1 f32 bound (TS: 0.00005)
    }
}

mod initialize_hue_saturation_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_hue_saturation_adjustment() {
        let mut out: HueSaturationAdjustment = allocate_entity();
        initialize_hue_saturation_adjustment(
            &mut out,
            Some(&HueSaturationAdjustmentOptions {
                hue: Some(0.0),
                saturation: Some(1.0),
                lightness: Some(0.0),
            }),
        );
        assert_eq!(out.hue, 0.0);
        assert_eq!(out.saturation, 1.0);
        assert_eq!(out.lightness, 0.0);
    }
}
