use super::*;

fn channel_of(color: u32, index: u32) -> u32 {
    return (color >> (24 - index * 8)) & 0xff;
}

mod can_lerp_effects {
    use super::*;

    #[test]
    fn returns_false_for_different_kinds() {
        assert!(!can_lerp_effects(
            &effect_ref(create_bloom_effect()),
            &effect_ref(create_vignette_effect()),
        ));
    }

    #[test]
    fn returns_true_for_same_kind() {
        assert!(can_lerp_effects(
            &effect_ref(create_bloom_effect()),
            &effect_ref(create_bloom_effect()),
        ));
    }
}

mod lerp_effect {
    use super::*;

    fn bloom(threshold: f32, radius: f32) -> Ref<BloomEffect> {
        let effect = create_bloom_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.threshold = Some(threshold);
            guard.radius = Some(radius);
        }
        return effect;
    }

    fn vignette(color: u32, intensity: Option<f32>) -> Ref<VignetteEffect> {
        let effect = create_vignette_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.color = Some(color);
            guard.intensity = intensity;
        }
        return effect;
    }

    #[test]
    fn at_t_one_writes_b_values() {
        let a = bloom(0.2, 4.0);
        let b = bloom(0.8, 16.0);
        let out = create_bloom_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            1.0,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(out.read().unwrap().threshold, Some(0.8));
        assert_eq!(out.read().unwrap().radius, Some(16.0));
    }

    #[test]
    fn at_t_zero_writes_a_values() {
        let a = bloom(0.2, 4.0);
        let b = bloom(0.8, 16.0);
        let out = create_bloom_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.0,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(out.read().unwrap().threshold, Some(0.2));
        assert_eq!(out.read().unwrap().radius, Some(4.0));
    }

    #[test]
    fn boolean_fields_snap_at_half_boundary() {
        let a = create_vignette_effect();
        let b = create_vignette_effect();
        a.write()
            .unwrap()
            .set_effect_field("enabled", EffectValue::Boolean(false));
        b.write()
            .unwrap()
            .set_effect_field("enabled", EffectValue::Boolean(true));
        let out = create_vignette_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.4,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(
            out.read().unwrap().get_effect_field("enabled"),
            Some(EffectValue::Boolean(false))
        );
        let a = create_vignette_effect();
        let b = create_vignette_effect();
        a.write()
            .unwrap()
            .set_effect_field("enabled", EffectValue::Boolean(false));
        b.write()
            .unwrap()
            .set_effect_field("enabled", EffectValue::Boolean(true));
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.5,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(
            out.read().unwrap().get_effect_field("enabled"),
            Some(EffectValue::Boolean(true))
        );
    }

    #[test]
    fn interpolates_a_packed_color_per_channel() {
        let a = vignette(0xff0000ff, None);
        let b = vignette(0x0000ffff, None);
        let out = create_vignette_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.5,
            &effect_ref(out.clone()),
            None,
        );
        let color = out.read().unwrap().color.unwrap();
        assert_eq!(channel_of(color, 1), 0);
        assert_ne!(color, 0x7f8080ff);
    }

    #[test]
    fn interpolates_numeric_fields_at_half() {
        let a = bloom(0.0, 0.0);
        let b = bloom(1.0, 10.0);
        let out = create_bloom_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.5,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(out.read().unwrap().threshold, Some(0.5));
        assert_eq!(out.read().unwrap().radius, Some(5.0));
    }

    #[test]
    fn is_alias_safe_for_a_color_field_when_out_is_a() {
        let a = vignette(0xff0000ff, None);
        let b = vignette(0x0000ffff, None);
        let a_ref = effect_ref(a.clone());
        lerp_effect(&a_ref, &effect_ref(b), 0.5, &a_ref, None);
        assert_eq!(channel_of(a.read().unwrap().color.unwrap(), 1), 0);
    }

    #[test]
    fn is_alias_safe_when_out_is_a() {
        let a = bloom(0.0, 0.0);
        let b = bloom(1.0, 10.0);
        let a_ref = effect_ref(a.clone());
        lerp_effect(&a_ref, &effect_ref(b), 0.5, &a_ref, None);
        assert_eq!(a.read().unwrap().threshold, Some(0.5));
    }

    #[test]
    fn writes_a_separate_output_when_both_inputs_share_identity() {
        let source = bloom(0.75, 9.0);
        let source_ref = effect_ref(source.clone());
        let out = bloom(0.0, 0.0);
        assert!(lerp_effect(
            &source_ref,
            &source_ref,
            0.5,
            &effect_ref(out.clone()),
            None,
        ));
        assert_eq!(out.read().unwrap().threshold, Some(0.75));
        assert_eq!(out.read().unwrap().radius, Some(9.0));
        assert_eq!(source.read().unwrap().threshold, Some(0.75));
    }

    #[test]
    fn keeps_equal_packed_colors_bit_identical() {
        let a = vignette(0x3366ccff, None);
        let b = vignette(0x3366ccff, None);
        let out = create_vignette_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.37,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(out.read().unwrap().color, Some(0x3366ccff));
    }

    #[test]
    fn returns_each_color_endpoint_exactly() {
        let a = vignette(0xff0000ff, None);
        let b = vignette(0x00ff00ff, None);
        let out = create_vignette_effect();
        lerp_effect(
            &effect_ref(a.clone()),
            &effect_ref(b.clone()),
            0.0,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(out.read().unwrap().color, Some(0xff0000ff));
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            1.0,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(out.read().unwrap().color, Some(0x00ff00ff));
    }

    #[test]
    fn returns_false_and_leaves_out_unchanged_for_mismatched_kinds() {
        let a = bloom(0.5, 4.0);
        let b = vignette(0, Some(1.0));
        let out = bloom(0.99, 4.0);
        assert!(!lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.5,
            &effect_ref(out.clone()),
            None
        ));
        assert_eq!(out.read().unwrap().threshold, Some(0.99));
    }

    #[test]
    fn returns_true_on_success() {
        assert!(lerp_effect(
            &effect_ref(create_bloom_effect()),
            &effect_ref(create_bloom_effect()),
            0.5,
            &effect_ref(create_bloom_effect()),
            None,
        ));
    }

    #[test]
    fn still_lerps_an_ordinary_scalar_on_a_color_kind() {
        let a = vignette(0xff0000ff, Some(0.0));
        let b = vignette(0x0000ffff, Some(1.0));
        let out = create_vignette_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.25,
            &effect_ref(out.clone()),
            None,
        );
        assert_eq!(out.read().unwrap().intensity, Some(0.25));
    }

    #[test]
    fn treats_every_color_field_on_a_multi_color_kind() {
        let a = create_bevel_effect();
        let b = create_bevel_effect();
        {
            let mut guard = a.write().unwrap();
            guard.highlight_color = Some(0xff0000ff);
            guard.shadow_color = Some(0xff0000ff);
        }
        {
            let mut guard = b.write().unwrap();
            guard.highlight_color = Some(0x0000ffff);
            guard.shadow_color = Some(0x0000ffff);
        }
        let out = create_bevel_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.5,
            &effect_ref(out.clone()),
            None,
        );
        let guard = out.read().unwrap();
        assert_eq!(channel_of(guard.highlight_color.unwrap(), 1), 0);
        assert_eq!(channel_of(guard.shadow_color.unwrap(), 1), 0);
    }

    #[test]
    fn writes_a_whole_packed_integer_with_interpolated_alpha() {
        let a = vignette(0xff0000ff, None);
        let b = vignette(0x00ff0000, None);
        let out = create_vignette_effect();
        lerp_effect(
            &effect_ref(a),
            &effect_ref(b),
            0.5,
            &effect_ref(out.clone()),
            None,
        );
        let alpha = channel_of(out.read().unwrap().color.unwrap(), 3);
        assert!(alpha > 0);
        assert!(alpha < 255);
    }
}
