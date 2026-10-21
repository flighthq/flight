use flight_color::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-3,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn assert_approx_tight(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-5,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod allocate_hsl_color {
    use super::*;

    #[test]
    fn allocates_a_zeroed_three_component_hsl_color() {
        let c = allocate_hsl_color();
        assert_eq!(c.h, 0.0);
        assert_eq!(c.s, 0.0);
        assert_eq!(c.l, 0.0);
    }
}

mod hsl_to_rgb {
    use super::*;

    #[test]
    fn produces_achromatic_rgb_for_saturation_zero() {
        let mut out = [0.0_f32, 0.0, 0.0, 1.0];
        hsl_to_rgb(&mut out, 0.0, 0.0, 0.5);
        assert_approx(out[0], 0.5);
        assert_approx(out[1], 0.5);
        assert_approx(out[2], 0.5);
    }

    #[test]
    fn round_trips_with_rgb_to_hsl_for_a_primary_color() {
        let mut out = [0.0_f32, 0.0, 0.0, 1.0];
        hsl_to_rgb(&mut out, 0.0, 1.0, 0.5);
        assert_approx_tight(out[0], 1.0);
        assert_approx_tight(out[1], 0.0);
        assert_approx_tight(out[2], 0.0);
    }

    #[test]
    fn does_not_modify_out_3_alpha() {
        let mut out = [0.0_f32, 0.0, 0.0, 0.75];
        hsl_to_rgb(&mut out, 120.0, 1.0, 0.5);
        assert_eq!(out[3], 0.75);
    }
}

mod rgb_to_hsl {
    use super::*;

    #[test]
    fn converts_pure_red_to_hue_0_s_1_l_half() {
        let mut out = allocate_hsl_color();
        rgb_to_hsl(&mut out, 0xff0000ff);
        assert_approx(out.h, 0.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.l, 0.5);
    }

    #[test]
    fn converts_white_to_hue_0_s_0_l_1() {
        let mut out = allocate_hsl_color();
        rgb_to_hsl(&mut out, 0xffffffff);
        assert_eq!(out.h, 0.0);
        assert_eq!(out.s, 0.0);
        assert_approx_tight(out.l, 1.0);
    }

    #[test]
    fn converts_black_to_hue_0_s_0_l_0() {
        let mut out = allocate_hsl_color();
        rgb_to_hsl(&mut out, 0x000000ff);
        assert_eq!(out.h, 0.0);
        assert_eq!(out.s, 0.0);
        assert_approx_tight(out.l, 0.0);
    }

    #[test]
    fn converts_a_green_dominant_color() {
        let mut out = allocate_hsl_color();
        rgb_to_hsl(&mut out, 0x00ff00ff);
        assert_approx(out.h, 120.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.l, 0.5);
    }

    #[test]
    fn wraps_a_red_dominant_hue_when_blue_exceeds_green() {
        let mut out = allocate_hsl_color();
        rgb_to_hsl(&mut out, 0xff00ffff);
        assert_approx(out.h, 300.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.l, 0.5);
    }

    #[test]
    fn uses_the_high_lightness_saturation_formula() {
        let mut out = allocate_hsl_color();
        rgb_to_hsl(&mut out, 0xff8080ff);
        assert_approx(out.h, 0.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.l, 0.75098);
    }

    #[test]
    fn round_trips_with_hsl_to_rgb_within_1_lsb() {
        let mut hsl = allocate_hsl_color();
        rgb_to_hsl(&mut hsl, 0x3c8ab5ff);
        let mut rgb = [0.0_f32, 0.0, 0.0, 1.0];
        hsl_to_rgb(&mut rgb, hsl.h, hsl.s, hsl.l);
        let repacked = ((rgb[0] * 255.0).round() as u32) << 24
            | ((rgb[1] * 255.0).round() as u32) << 16
            | ((rgb[2] * 255.0).round() as u32) << 8
            | 0xff;
        let orig: u32 = 0x3c8ab5ff;
        let orig_r = (orig >> 24) & 0xff;
        let rep_r = (repacked >> 24) & 0xff;
        assert!(
            (rep_r as i32 - orig_r as i32).abs() <= 1,
            "expected within 1 LSB, got orig={} rep={}",
            orig_r,
            rep_r
        );
    }
}
