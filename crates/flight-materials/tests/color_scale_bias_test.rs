use flight_materials::*;
use flight_materials::color_scale_bias::*;

mod create_color_scale_bias_tests {
    use super::*;

    #[test]
    fn initializes_scales_to_1_and_biases_to_0() {
        let ct = create_color_scale_bias();
        assert_eq!(ct.red_scale, 1.0);
        assert_eq!(ct.green_scale, 1.0);
        assert_eq!(ct.blue_scale, 1.0);
        assert_eq!(ct.alpha_scale, 1.0);
        assert_eq!(ct.red_bias, 0.0);
        assert_eq!(ct.green_bias, 0.0);
        assert_eq!(ct.blue_bias, 0.0);
        assert_eq!(ct.alpha_bias, 0.0);
    }
}

mod clone_color_scale_bias_tests {
    use super::*;

    #[test]
    fn returns_a_new_object_with_identical_values() {
        let mut ct = create_color_scale_bias();
        ct.red_scale = 0.5;
        ct.green_bias = 64.0;
        let cloned = clone_color_scale_bias(&ct);
        assert_eq!(cloned.red_scale, 0.5);
        assert_eq!(cloned.green_bias, 64.0);
    }

    #[test]
    fn does_not_share_references() {
        let mut ct = create_color_scale_bias();
        ct.red_bias = 10.0;
        let mut c = clone_color_scale_bias(&ct);
        c.red_bias = 99.0;
        assert_eq!(ct.red_bias, 10.0);
    }
}

mod concat_color_scale_bias_tests {
    use super::*;

    #[test]
    fn composes_two_identity_transforms_into_identity() {
        let a = create_color_scale_bias();
        let b = create_color_scale_bias();
        let mut out = create_color_scale_bias();
        out.red_scale = 0.0;
        out.green_scale = 0.0;
        out.blue_scale = 0.0;
        out.alpha_scale = 0.0;
        concat_color_scale_bias(&mut out, &a, &b);
        assert_eq!(out.red_scale, 1.0);
        assert_eq!(out.green_scale, 1.0);
        assert_eq!(out.blue_scale, 1.0);
        assert_eq!(out.alpha_scale, 1.0);
        assert_eq!(out.red_bias, 0.0);
    }

    #[test]
    fn multiplies_scales() {
        let mut a = create_color_scale_bias();
        a.red_scale = 2.0;
        a.green_scale = 0.5;
        let mut b = create_color_scale_bias();
        b.red_scale = 3.0;
        b.green_scale = 4.0;
        let mut out = create_color_scale_bias();
        concat_color_scale_bias(&mut out, &a, &b);
        assert_eq!(out.red_scale, 6.0);
        assert_eq!(out.green_scale, 2.0);
    }

    #[test]
    fn combines_biases() {
        let mut source = create_color_scale_bias();
        source.red_scale = 2.0;
        source.red_bias = 10.0;
        let mut other = create_color_scale_bias();
        other.red_bias = 5.0;
        let mut out = create_color_scale_bias();
        concat_color_scale_bias(&mut out, &source, &other);
        assert_eq!(out.red_bias, 2.0 * 5.0 + 10.0);
    }
}

mod copy_color_scale_bias_tests {
    use super::*;

    #[test]
    fn copies_all_fields() {
        let mut source = create_color_scale_bias();
        source.red_scale = 0.5;
        source.green_bias = 128.0;
        source.alpha_scale = 0.8;
        source.blue_bias = 64.0;
        let mut out = create_color_scale_bias();
        copy_color_scale_bias(&mut out, &source);
        assert_eq!(out.red_scale, 0.5);
        assert_eq!(out.green_scale, 1.0);
        assert_eq!(out.blue_scale, 1.0);
        assert_eq!(out.alpha_scale, 0.8);
        assert_eq!(out.red_bias, 0.0);
        assert_eq!(out.green_bias, 128.0);
        assert_eq!(out.blue_bias, 64.0);
        assert_eq!(out.alpha_bias, 0.0);
    }
}

mod copy_color_scale_bias_to_arrays_tests {
    use super::*;

    #[test]
    fn writes_scales_and_biases_into_arrays() {
        let mut ct = create_color_scale_bias();
        set_color_scale_bias(&mut ct, 0.5, 0.25, 2.0, 0.8, 10.0, 20.0, 30.0, 40.0);
        let mut scales = [0.0f32; 4];
        let mut biases = [0.0f32; 4];
        copy_color_scale_bias_to_arrays(&mut scales, &mut biases, &ct);
        assert_eq!(scales, [0.5, 0.25, 2.0, 0.8]);
        assert_eq!(biases, [10.0, 20.0, 30.0, 40.0]);
    }

    #[test]
    fn writes_into_existing_arrays() {
        let ct = create_color_scale_bias();
        let mut scales = [9.0f32; 4];
        let mut biases = [9.0f32; 4];
        copy_color_scale_bias_to_arrays(&mut scales, &mut biases, &ct);
        assert_eq!(scales, [1.0, 1.0, 1.0, 1.0]);
        assert_eq!(biases, [0.0, 0.0, 0.0, 0.0]);
    }
}

mod equals_color_scale_bias_tests {
    use super::*;

    #[test]
    fn returns_true_for_two_identity_transforms() {
        assert!(equals_color_scale_bias(&create_color_scale_bias(), &create_color_scale_bias()));
    }

    #[test]
    fn returns_false_when_any_field_differs() {
        let mut a = create_color_scale_bias();
        a.red_scale = 0.5;
        assert!(!equals_color_scale_bias(&a, &create_color_scale_bias()));
        let mut b = create_color_scale_bias();
        b.red_bias = 1.0;
        assert!(!equals_color_scale_bias(&b, &create_color_scale_bias()));
    }
}

mod equals_color_scale_bias_biases_tests {
    use super::*;

    #[test]
    fn ignores_alpha_when_compare_alpha_is_false() {
        let mut a = create_color_scale_bias();
        a.alpha_bias = 50.0;
        let b = create_color_scale_bias();
        assert!(equals_color_scale_bias_biases(&a, &b, false));
    }

    #[test]
    fn still_compares_rgb_when_compare_alpha_is_false() {
        let mut a = create_color_scale_bias();
        a.red_bias = 50.0;
        let b = create_color_scale_bias();
        assert!(!equals_color_scale_bias_biases(&a, &b, false));
    }
}

mod equals_color_scale_bias_scales_tests {
    use super::*;

    #[test]
    fn ignores_alpha_when_compare_alpha_is_false() {
        let mut a = create_color_scale_bias();
        a.alpha_scale = 0.5;
        let b = create_color_scale_bias();
        assert!(equals_color_scale_bias_scales(&a, &b, false));
    }

    #[test]
    fn still_compares_rgb_when_compare_alpha_is_false() {
        let mut a = create_color_scale_bias();
        a.red_scale = 0.5;
        let b = create_color_scale_bias();
        assert!(!equals_color_scale_bias_scales(&a, &b, false));
    }
}

mod get_color_scale_bias_bias_rgb_tests {
    use super::*;

    #[test]
    fn packs_biases_into_a_single_integer() {
        let mut ct = create_color_scale_bias();
        ct.red_bias = 1.0;
        ct.green_bias = 0x80 as f32 / 255.0;
        ct.blue_bias = 0x10 as f32 / 255.0;
        let packed = get_color_scale_bias_bias_rgb(&ct);
        assert_eq!((packed >> 16) & 0xff, 0xff);
        assert_eq!((packed >> 8) & 0xff, 0x80);
        assert_eq!(packed & 0xff, 0x10);
    }

    #[test]
    fn returns_0_when_all_biases_are_0() {
        assert_eq!(get_color_scale_bias_bias_rgb(&create_color_scale_bias()), 0);
    }
}

mod get_color_scale_bias_bias_rgba_tests {
    use super::*;

    #[test]
    fn packs_biases_into_a_single_integer() {
        let mut ct = create_color_scale_bias();
        ct.red_bias = 0x10 as f32 / 255.0;
        ct.green_bias = 0x20 as f32 / 255.0;
        ct.blue_bias = 0x30 as f32 / 255.0;
        ct.alpha_bias = 0x40 as f32 / 255.0;
        let packed = get_color_scale_bias_bias_rgba(&ct);
        assert_eq!((packed >> 24) & 0xff, 0x10);
        assert_eq!((packed >> 16) & 0xff, 0x20);
        assert_eq!((packed >> 8) & 0xff, 0x30);
        assert_eq!(packed & 0xff, 0x40);
    }

    #[test]
    fn returns_0_when_all_biases_are_0() {
        assert_eq!(get_color_scale_bias_bias_rgba(&create_color_scale_bias()), 0);
    }
}

mod invert_color_scale_bias_tests {
    use super::*;

    #[test]
    fn reciprocates_scales() {
        let mut source = create_color_scale_bias();
        source.red_scale = 2.0;
        source.green_scale = 4.0;
        source.blue_scale = 0.5;
        source.alpha_scale = 0.25;
        let mut out = create_color_scale_bias();
        invert_color_scale_bias(&mut out, &source);
        assert_eq!(out.red_scale, 0.5);
        assert_eq!(out.green_scale, 0.25);
        assert_eq!(out.blue_scale, 2.0);
        assert_eq!(out.alpha_scale, 4.0);
    }

    #[test]
    fn negates_biases() {
        let mut source = create_color_scale_bias();
        source.red_bias = 64.0;
        source.green_bias = -32.0;
        source.blue_bias = 128.0;
        source.alpha_bias = -10.0;
        let mut out = create_color_scale_bias();
        invert_color_scale_bias(&mut out, &source);
        assert_eq!(out.red_bias, -64.0);
        assert_eq!(out.green_bias, 32.0);
        assert_eq!(out.blue_bias, -128.0);
        assert_eq!(out.alpha_bias, 10.0);
    }

    #[test]
    fn uses_1_when_scale_is_0() {
        let mut source = create_color_scale_bias();
        source.red_scale = 0.0;
        source.green_scale = 0.0;
        source.blue_scale = 0.0;
        source.alpha_scale = 0.0;
        let mut out = create_color_scale_bias();
        invert_color_scale_bias(&mut out, &source);
        assert_eq!(out.red_scale, 1.0);
        assert_eq!(out.green_scale, 1.0);
        assert_eq!(out.blue_scale, 1.0);
        assert_eq!(out.alpha_scale, 1.0);
    }
}

mod is_identity_color_scale_bias_tests {
    use super::*;

    #[test]
    fn returns_true_for_default() {
        assert!(is_identity_color_scale_bias(&create_color_scale_bias(), true));
    }

    #[test]
    fn returns_false_when_scale_differs() {
        let mut ct = create_color_scale_bias();
        ct.red_scale = 0.5;
        assert!(!is_identity_color_scale_bias(&ct, true));
    }

    #[test]
    fn returns_false_when_bias_is_nonzero() {
        let mut ct = create_color_scale_bias();
        ct.green_bias = 1.0;
        assert!(!is_identity_color_scale_bias(&ct, true));
    }

    #[test]
    fn returns_true_when_alpha_scale_differs_but_not_compared() {
        let mut ct = create_color_scale_bias();
        ct.alpha_scale = 0.0;
        assert!(is_identity_color_scale_bias(&ct, false));
    }
}

mod set_color_scale_bias_tests {
    use super::*;

    #[test]
    fn sets_all_eight_fields() {
        let mut ct = create_color_scale_bias();
        set_color_scale_bias(&mut ct, 0.1, 0.2, 0.3, 0.4, 10.0, 20.0, 30.0, 40.0);
        assert_eq!(ct.red_scale, 0.1);
        assert_eq!(ct.green_scale, 0.2);
        assert_eq!(ct.blue_scale, 0.3);
        assert_eq!(ct.alpha_scale, 0.4);
        assert_eq!(ct.red_bias, 10.0);
        assert_eq!(ct.green_bias, 20.0);
        assert_eq!(ct.blue_bias, 30.0);
        assert_eq!(ct.alpha_bias, 40.0);
    }
}

mod set_color_scale_bias_bias_rgb_tests {
    use super::*;

    #[test]
    fn unpacks_rgb_from_packed_integer() {
        let mut ct = create_color_scale_bias();
        set_color_scale_bias_bias_rgb(&mut ct, (0xab << 16) | (0xcd << 8) | 0xef);
        assert!((ct.red_bias - 0xab as f32 / 255.0).abs() < 0.01);
        assert!((ct.green_bias - 0xcd as f32 / 255.0).abs() < 0.01);
        assert!((ct.blue_bias - 0xef as f32 / 255.0).abs() < 0.01);
        assert_eq!(ct.alpha_bias, 0.0);
    }

    #[test]
    fn zeroes_rgb_scales_keeps_alpha_at_1() {
        let mut ct = create_color_scale_bias();
        set_color_scale_bias_bias_rgb(&mut ct, 0xffffff);
        assert_eq!(ct.red_scale, 0.0);
        assert_eq!(ct.green_scale, 0.0);
        assert_eq!(ct.blue_scale, 0.0);
        assert_eq!(ct.alpha_scale, 1.0);
    }
}

mod set_color_scale_bias_bias_rgba_tests {
    use super::*;

    #[test]
    fn unpacks_rgba_from_packed_integer() {
        let mut ct = create_color_scale_bias();
        set_color_scale_bias_bias_rgba(&mut ct, (0x10 << 24) | (0x20 << 16) | (0x30 << 8) | 0x40);
        assert!((ct.red_bias - 0x10 as f32 / 255.0).abs() < 0.01);
        assert!((ct.green_bias - 0x20 as f32 / 255.0).abs() < 0.01);
        assert!((ct.blue_bias - 0x30 as f32 / 255.0).abs() < 0.01);
        assert!((ct.alpha_bias - 0x40 as f32 / 255.0).abs() < 0.01);
    }

    #[test]
    fn zeroes_all_scales() {
        let mut ct = create_color_scale_bias();
        set_color_scale_bias_bias_rgba(&mut ct, 0xffffffff);
        assert_eq!(ct.red_scale, 0.0);
        assert_eq!(ct.green_scale, 0.0);
        assert_eq!(ct.blue_scale, 0.0);
        assert_eq!(ct.alpha_scale, 0.0);
    }
}

mod set_color_scale_bias_identity_tests {
    use super::*;

    #[test]
    fn resets_to_identity() {
        let mut ct = create_color_scale_bias();
        ct.red_scale = 0.5;
        ct.green_bias = 128.0;
        ct.alpha_scale = 0.0;
        ct.blue_bias = 64.0;
        set_color_scale_bias_identity(&mut ct);
        assert_eq!(ct.red_scale, 1.0);
        assert_eq!(ct.green_scale, 1.0);
        assert_eq!(ct.blue_scale, 1.0);
        assert_eq!(ct.alpha_scale, 1.0);
        assert_eq!(ct.red_bias, 0.0);
        assert_eq!(ct.green_bias, 0.0);
        assert_eq!(ct.blue_bias, 0.0);
        assert_eq!(ct.alpha_bias, 0.0);
    }
}
