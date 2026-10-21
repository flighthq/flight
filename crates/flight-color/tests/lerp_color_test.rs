use flight_color::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod lerp_color {
    use super::*;

    #[test]
    fn returns_start_at_t_0() {
        assert_eq!(lerp_color(0xff0000ff, 0x0000ffff, 0.0), 0xff0000ff);
    }

    #[test]
    fn returns_end_at_t_1() {
        assert_eq!(lerp_color(0xff0000ff, 0x0000ffff, 1.0), 0x0000ffff);
    }

    #[test]
    fn clamps_t_below_0_to_0() {
        assert_eq!(lerp_color(0xff0000ff, 0x0000ffff, -1.0), 0xff0000ff);
    }

    #[test]
    fn clamps_t_above_1_to_1() {
        assert_eq!(lerp_color(0xff0000ff, 0x0000ffff, 2.0), 0x0000ffff);
    }

    #[test]
    fn midpoint_between_black_and_white_is_approximately_mid_gray() {
        let mid = lerp_color(0x000000ff, 0xffffffff, 0.5);
        let r = (mid >> 24) & 0xff;
        assert!(
            (r as i32 - 0xbc_i32).abs() < 5,
            "expected red near 0xbc, got 0x{:02x}",
            r
        );
    }
}

mod lerp_linear_color {
    use super::*;

    #[test]
    fn returns_start_at_t_0() {
        let mut out = allocate_linear_color();
        let mut start = allocate_linear_color();
        start.r = 1.0;
        start.a = 1.0;
        let mut end = allocate_linear_color();
        end.b = 1.0;
        end.a = 1.0;
        lerp_linear_color(&mut out, &start, &end, 0.0);
        assert_eq!(out.r, start.r);
        assert_eq!(out.g, start.g);
        assert_eq!(out.b, start.b);
        assert_eq!(out.a, start.a);
    }

    #[test]
    fn returns_end_at_t_1() {
        let mut out = allocate_linear_color();
        let mut start = allocate_linear_color();
        start.r = 1.0;
        start.a = 1.0;
        let mut end = allocate_linear_color();
        end.b = 1.0;
        end.a = 1.0;
        lerp_linear_color(&mut out, &start, &end, 1.0);
        assert_eq!(out.r, end.r);
        assert_eq!(out.g, end.g);
        assert_eq!(out.b, end.b);
        assert_eq!(out.a, end.a);
    }

    #[test]
    fn is_alias_safe_when_out_is_the_same_object_as_start() {
        let mut out = allocate_linear_color();
        out.r = 1.0;
        out.a = 1.0;
        let out_copy = LinearColor {
            r: out.r,
            g: out.g,
            b: out.b,
            a: out.a,
        };
        let mut end = allocate_linear_color();
        end.b = 1.0;
        end.a = 1.0;
        lerp_linear_color(&mut out, &out_copy, &end, 0.5);
        assert_approx(out.r, 0.5);
        assert_approx(out.b, 0.5);
    }
}
