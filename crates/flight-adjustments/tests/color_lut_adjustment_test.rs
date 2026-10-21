use flight_adjustments::contract::*;

mod apply_color_transform {
    use super::*;

    #[test]
    fn wraps_a_matrix_tier_adjustment_as_an_rgb_transform_at_opaque_alpha() {
        let adj = create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) }));
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        (get_adjustment_color_transform(&adj).unwrap())(&mut out, 1.0, 0.0, 0.0);
        assert!((out[0] - 0.0).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[1] - 1.0).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
        assert!((out[2] - 1.0).abs() < 0.000005); // D1 f32 bound (TS: 0.000005)
    }
}

mod get_adjustment_color_transform {
    use super::*;

    #[test]
    fn returns_the_operations_own_transform_for_a_lut_tier_adjustment() {
        let adj = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(45.0), saturation: Some(1.0), lightness: Some(0.0) }));
        let returned = get_adjustment_color_transform(&adj).unwrap();
        assert!(std::sync::Arc::ptr_eq(&returned, adj.transform.as_ref().unwrap()));
    }

    #[test]
    fn returns_true_for_a_matrix_tier_adjustment() {
        let adj = create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) }));
        assert!(get_adjustment_color_transform(&adj).is_some());
    }
}

mod initialize_color_lut_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut adj = create_hue_saturation_adjustment(None);
        let swap: ColorTransformFunction = std::sync::Arc::new(|out: &mut [f32; 3], r: f32, g: f32, b: f32| {
            out[0] = b;
            out[1] = g;
            out[2] = r;
        });
        initialize_color_lut_adjustment(&mut adj, "acme.Swap", swap);
        assert_eq!(adj.kind, "acme.Swap");
        let mut out = [0.0; 3];
        (adj.transform.as_ref().unwrap())(&mut out, 0.1, 0.2, 0.3);
        assert_eq!(out, [0.3, 0.2, 0.1]);
    }
}

mod is_color_lut_adjustment {
    use super::*;

    #[test]
    fn is_true_for_a_lut_tier_adjustment() {
        let adj = create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(1.0), lightness: Some(0.0) }));
        assert!(is_color_lut_adjustment(&adj));
    }

    #[test]
    fn is_false_for_a_matrix_tier_adjustment() {
        let adj = create_invert_adjustment(Some(&InvertAdjustmentOptions { intensity: Some(1.0) }));
        assert!(!is_color_lut_adjustment(&adj));
    }
}
