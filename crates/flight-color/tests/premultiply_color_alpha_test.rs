use flight_color::*;

mod premultiply_color_alpha {
    use super::*;

    #[test]
    fn returns_fully_opaque_color_unchanged() {
        assert_eq!(premultiply_color_alpha(0xff0000ff), 0xff0000ff);
    }

    #[test]
    fn multiplies_rgb_by_alpha_and_preserves_the_alpha_channel() {
        let result = premultiply_color_alpha(0xff00007f);
        let r = (result >> 24) & 0xff;
        assert!(
            (r as i32 - 0x7f_i32).abs() <= 5,
            "expected red near 0x7f, got 0x{:02x}",
            r
        );
        assert_eq!(result & 0xff, 0x7f);
    }

    #[test]
    fn returns_black_with_alpha_0_for_fully_transparent_color() {
        let result = premultiply_color_alpha(0xff000000);
        assert_eq!(result & 0xff, 0);
        assert_eq!((result >> 24) & 0xff, 0);
    }

    #[test]
    fn round_trips_with_unpremultiply_color_alpha_for_fully_opaque() {
        let color: u32 = 0xab3456ff;
        assert_eq!(
            unpremultiply_color_alpha(premultiply_color_alpha(color)),
            color
        );
    }
}

mod unpremultiply_color_alpha {
    use super::*;

    #[test]
    fn returns_fully_opaque_color_unchanged() {
        assert_eq!(unpremultiply_color_alpha(0xff0000ff), 0xff0000ff);
    }

    #[test]
    fn divides_rgb_by_alpha_and_preserves_the_alpha_channel() {
        let premul = premultiply_color_alpha((0xff0000ff & 0xffffff80) | 0x80);
        let result = unpremultiply_color_alpha(premul);
        assert_eq!(result & 0xff, 0x80);
    }

    #[test]
    fn returns_the_input_unchanged_for_alpha_0() {
        let color: u32 = 0xff000000;
        assert_eq!(unpremultiply_color_alpha(color), color);
    }
}
