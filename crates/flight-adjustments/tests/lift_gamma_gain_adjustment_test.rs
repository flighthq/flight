use flight_adjustments::*;

mod create_lift_gamma_gain_adjustment {
    use super::*;

    #[test]
    fn defaults_to_approximately_neutral() {
        // The packed gamma neutral 0x808080 is 128/255 ~ 0.502, not exactly 0.5, so the default gamma
        // exponent is ~0.996 rather than 1 -- faithful to the ported shader.
        let adj: Adjustment = create_lift_gamma_gain_adjustment(0x000000ff, 0x808080ff, 0xffffffff).into();
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 0.3, 0.6, 0.9);
        assert!((out[0] - 0.3).abs() < 0.01);
        assert!((out[1] - 0.6).abs() < 0.01);
        assert!((out[2] - 0.9).abs() < 0.01);
    }

    #[test]
    fn applies_gain_as_a_per_channel_multiplier() {
        // gain 0x808080ff -> ~0.5 multiplier on each channel (before the near-neutral default gamma).
        let adj: Adjustment = create_lift_gamma_gain_adjustment(0x000000ff, 0x808080ff, 0x808080ff).into();
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 1.0, 1.0, 1.0);
        assert!((out[0] - 128.0 / 255.0).abs() < 0.01);
    }

    #[test]
    fn lifts_shadows_toward_the_lift_color() {
        // lift 0xffffffff pulls dark values up toward white via (1 - rgb).
        let adj: Adjustment = create_lift_gamma_gain_adjustment(0xffffffff, 0x808080ff, 0xffffffff).into();
        let mut out: [f32; 3] = [0.0, 0.0, 0.0];
        apply_color_transform(&adj, &mut out, 0.0, 0.0, 0.0);
        assert!((out[0] - 1.0).abs() < 1e-4);
    }
}

mod initialize_lift_gamma_gain_adjustment {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_lift_gamma_gain_adjustment() {
        let mut out = LiftGammaGainAdjustment::default();
        initialize_lift_gamma_gain_adjustment(&mut out, 0x000000ff, 0x808080ff, 0xffffffff);
        assert_eq!(out.lift, 0x000000ff);
        assert_eq!(out.gamma, 0x808080ff);
        assert_eq!(out.gain, 0xffffffff);
    }
}
