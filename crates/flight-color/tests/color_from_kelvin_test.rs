use flight_color::*;

mod color_from_kelvin {
    use super::*;

    #[test]
    fn returns_opaque_alpha_for_all_temperatures() {
        assert_eq!(color_from_kelvin(3000.0) & 0xff, 0xff);
        assert_eq!(color_from_kelvin(6500.0) & 0xff, 0xff);
        assert_eq!(color_from_kelvin(10000.0) & 0xff, 0xff);
    }

    #[test]
    fn returns_white_for_d65_daylight_6500k() {
        let color = color_from_kelvin(6500.0);
        let r = (color >> 24) & 0xff;
        let g = (color >> 16) & 0xff;
        let b = (color >> 8) & 0xff;
        assert!(r > 240, "red channel {} should be > 240", r);
        assert!(g > 240, "green channel {} should be > 240", g);
        assert!(b > 230, "blue channel {} should be > 230", b);
    }

    #[test]
    fn produces_warmer_more_red_less_blue_color_for_lower_temperatures() {
        let warm = color_from_kelvin(2000.0);
        let cool = color_from_kelvin(10000.0);
        let warm_r = (warm >> 24) & 0xff;
        let warm_b = (warm >> 8) & 0xff;
        let cool_r = (cool >> 24) & 0xff;
        let cool_b = (cool >> 8) & 0xff;
        assert!(warm_r >= cool_r);
        assert!(warm_b <= cool_b);
    }

    #[test]
    fn clamps_inputs_below_1000k_to_1000k() {
        assert_eq!(color_from_kelvin(500.0), color_from_kelvin(1000.0));
    }

    #[test]
    fn clamps_inputs_above_40000k_to_40000k() {
        assert_eq!(color_from_kelvin(50000.0), color_from_kelvin(40000.0));
    }

    #[test]
    fn returns_a_valid_packed_rgba_integer() {
        let color = color_from_kelvin(5500.0);
        assert!(color <= 0xffffffff);
    }
}
