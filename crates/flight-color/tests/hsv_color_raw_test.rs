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

mod allocate_hsv_color {
    use super::*;

    #[test]
    fn allocates_a_zeroed_three_component_hsv_color() {
        let c = allocate_hsv_color();
        assert_eq!(c.h, 0.0);
        assert_eq!(c.s, 0.0);
        assert_eq!(c.v, 0.0);
    }
}

mod hsv_to_rgb {
    use super::*;

    #[test]
    fn produces_achromatic_rgb_for_saturation_zero() {
        let mut out = [0.0_f32, 0.0, 0.0, 1.0];
        hsv_to_rgb(&mut out, 0.0, 0.0, 0.6);
        assert_approx(out[0], 0.6);
        assert_approx(out[1], 0.6);
        assert_approx(out[2], 0.6);
    }

    #[test]
    fn produces_pure_red_for_h0_s1_v1() {
        let mut out = [0.0_f32, 0.0, 0.0, 1.0];
        hsv_to_rgb(&mut out, 0.0, 1.0, 1.0);
        assert_approx_tight(out[0], 1.0);
        assert_approx_tight(out[1], 0.0);
        assert_approx_tight(out[2], 0.0);
    }

    #[test]
    fn round_trips_with_rgb_to_hsv_for_pure_green() {
        let mut out = [0.0_f32, 0.0, 0.0, 1.0];
        hsv_to_rgb(&mut out, 120.0, 1.0, 1.0);
        assert_approx_tight(out[0], 0.0);
        assert_approx_tight(out[1], 1.0);
        assert_approx_tight(out[2], 0.0);
    }

    #[test]
    fn converts_hue_90_through_its_color_wheel_sector() {
        let mut out = [0.0_f32, 0.0, 0.0, 0.75];
        hsv_to_rgb(&mut out, 90.0, 1.0, 1.0);
        assert_approx_tight(out[0], 0.5);
        assert_approx_tight(out[1], 1.0);
        assert_approx_tight(out[2], 0.0);
        assert_eq!(out[3], 0.75);
    }

    #[test]
    fn converts_hue_210_through_its_color_wheel_sector() {
        let mut out = [0.0_f32, 0.0, 0.0, 0.75];
        hsv_to_rgb(&mut out, 210.0, 1.0, 1.0);
        assert_approx_tight(out[0], 0.0);
        assert_approx_tight(out[1], 0.5);
        assert_approx_tight(out[2], 1.0);
        assert_eq!(out[3], 0.75);
    }

    #[test]
    fn converts_hue_270_through_its_color_wheel_sector() {
        let mut out = [0.0_f32, 0.0, 0.0, 0.75];
        hsv_to_rgb(&mut out, 270.0, 1.0, 1.0);
        assert_approx_tight(out[0], 0.5);
        assert_approx_tight(out[1], 0.0);
        assert_approx_tight(out[2], 1.0);
        assert_eq!(out[3], 0.75);
    }

    #[test]
    fn converts_hue_330_through_its_color_wheel_sector() {
        let mut out = [0.0_f32, 0.0, 0.0, 0.75];
        hsv_to_rgb(&mut out, 330.0, 1.0, 1.0);
        assert_approx_tight(out[0], 1.0);
        assert_approx_tight(out[1], 0.0);
        assert_approx_tight(out[2], 0.5);
        assert_eq!(out[3], 0.75);
    }
}

mod rgb_to_hsv {
    use super::*;

    #[test]
    fn converts_pure_red_to_hue_0_s_1_v_1() {
        let mut out = allocate_hsv_color();
        rgb_to_hsv(&mut out, 0xff0000ff);
        assert_approx(out.h, 0.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.v, 1.0);
    }

    #[test]
    fn converts_black_to_s_0_v_0() {
        let mut out = allocate_hsv_color();
        rgb_to_hsv(&mut out, 0x000000ff);
        assert_eq!(out.s, 0.0);
        assert_approx_tight(out.v, 0.0);
    }

    #[test]
    fn converts_white_to_s_0_v_1() {
        let mut out = allocate_hsv_color();
        rgb_to_hsv(&mut out, 0xffffffff);
        assert_eq!(out.s, 0.0);
        assert_approx_tight(out.v, 1.0);
    }

    #[test]
    fn converts_pure_green_to_hue_120() {
        let mut out = allocate_hsv_color();
        rgb_to_hsv(&mut out, 0x00ff00ff);
        assert_approx(out.h, 120.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.v, 1.0);
    }

    #[test]
    fn converts_pure_blue_to_hue_240() {
        let mut out = allocate_hsv_color();
        rgb_to_hsv(&mut out, 0x0000ffff);
        assert_approx(out.h, 240.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.v, 1.0);
    }

    #[test]
    fn converts_magenta_to_hue_300() {
        let mut out = allocate_hsv_color();
        rgb_to_hsv(&mut out, 0xff00ffff);
        assert_approx(out.h, 300.0);
        assert_approx_tight(out.s, 1.0);
        assert_approx_tight(out.v, 1.0);
    }
}
