use flight_color::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn assert_approx_tight(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-6,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod allocate_linear_color {
    use super::*;

    #[test]
    fn allocates_a_zeroed_four_component_color() {
        let c = allocate_linear_color();
        assert_eq!(c.r, 0.0);
        assert_eq!(c.g, 0.0);
        assert_eq!(c.b, 0.0);
        assert_eq!(c.a, 0.0);
    }
}

mod compute_rgb_hex_string {
    use super::*;

    #[test]
    fn returns_a_6_digit_hex_string_of_the_lower_24_bits() {
        assert_eq!(compute_rgb_hex_string(0x00ff0000), "#ff0000");
        assert_eq!(compute_rgb_hex_string(0x0000ff00), "#00ff00");
        assert_eq!(compute_rgb_hex_string(0x000000ff), "#0000ff");
        assert_eq!(compute_rgb_hex_string(0x00000000), "#000000");
        assert_eq!(compute_rgb_hex_string(0x00ffffff), "#ffffff");
    }
}

mod compute_rgba_css_string {
    use super::*;

    #[test]
    fn preserves_every_channel_of_a_packed_rgba_color_in_css_form() {
        assert_eq!(compute_rgba_css_string(0xff0000ff), "rgba(255,0,0,1)");
        let s = compute_rgba_css_string(0x00ff0080);
        assert!(
            s.starts_with("rgba(0,255,0,0.501960"),
            "expected alpha near 0.5019608, got {}",
            s
        );
        assert_eq!(compute_rgba_css_string(0x00000000), "rgba(0,0,0,0)");
    }
}

mod get_color_alpha {
    use super::*;

    #[test]
    fn returns_the_alpha_byte_as_a_float_in_zero_to_one() {
        assert_approx(get_color_alpha(0x11223344), 0x44 as f32 / 0xff as f32);
        assert_eq!(get_color_alpha(0xffffffff), 1.0);
        assert_eq!(get_color_alpha(0xabcdef00), 0.0);
    }
}

mod get_color_rgb {
    use super::*;

    #[test]
    fn drops_the_alpha_byte_returning_the_24_bit_rgb() {
        assert_eq!(get_color_rgb(0xff8800ff), 0xff8800);
        assert_eq!(get_color_rgb(0x11223344), 0x112233);
    }

    #[test]
    fn round_trips_with_pack_opaque_color() {
        assert_eq!(get_color_rgb(pack_opaque_color(0x3366cc)), 0x3366cc);
    }
}

mod pack_color {
    use super::*;

    #[test]
    fn packs_white_components_to_0xffffffff() {
        assert_eq!(pack_color(1.0, 1.0, 1.0, 1.0), 0xffffffff);
    }

    #[test]
    fn packs_black_components_to_0x000000ff() {
        assert_eq!(pack_color(0.0, 0.0, 0.0, 1.0), 0x000000ff);
    }

    #[test]
    fn clamps_out_of_range_values() {
        assert_eq!(
            pack_color(2.0, -1.0, 0.5, 1.0),
            pack_color(1.0, 0.0, 0.5, 1.0)
        );
    }
}

mod pack_linear_to_color {
    use super::*;

    #[test]
    fn is_the_inverse_of_unpack_color_to_linear_for_white() {
        let mut out = allocate_linear_color();
        unpack_color_to_linear(&mut out, 0xffffffff);
        assert_eq!(pack_linear_to_color(&out), 0xffffffff);
    }

    #[test]
    fn is_the_inverse_of_unpack_color_to_linear_for_black_opaque() {
        let mut out = allocate_linear_color();
        unpack_color_to_linear(&mut out, 0x000000ff);
        assert_eq!(pack_linear_to_color(&out), 0x000000ff);
    }

    #[test]
    fn passes_alpha_through_without_gamma_encoding() {
        let color: u32 = 0x00000080;
        let mut out = allocate_linear_color();
        unpack_color_to_linear(&mut out, color);
        let repacked = pack_linear_to_color(&out);
        assert_eq!(repacked & 0xff, 0x80);
    }

    #[test]
    fn round_trips_a_mid_gray_color_within_1_lsb() {
        let color: u32 = 0x808080ff;
        let mut out = allocate_linear_color();
        unpack_color_to_linear(&mut out, color);
        let repacked = pack_linear_to_color(&out);
        let orig_r = (color >> 24) & 0xff;
        let rep_r = (repacked >> 24) & 0xff;
        assert!(
            (rep_r as i32 - orig_r as i32).abs() <= 1,
            "expected within 1 LSB, got orig={} rep={}",
            orig_r,
            rep_r
        );
    }
}

mod pack_opaque_color {
    use super::*;

    #[test]
    fn widens_24_bit_rgb_to_32_bit_rgba_with_full_opacity() {
        assert_eq!(pack_opaque_color(0x336699), 0x336699ff);
        assert_eq!(pack_opaque_color(0x000000), 0x000000ff);
        assert_eq!(pack_opaque_color(0xffffff), 0xffffffff);
    }

    #[test]
    fn masks_off_bits_above_24() {
        assert_eq!(pack_opaque_color(0xaa336699), 0x336699ff);
    }

    #[test]
    fn returns_an_unsigned_32_bit_integer() {
        assert!(pack_opaque_color(0xffffff) > 0);
    }
}

mod set_color_alpha {
    use super::*;

    #[test]
    fn replaces_the_alpha_byte_from_a_float_leaving_rgb_intact() {
        assert_eq!(set_color_alpha(0xff8800ff, 0.0), 0xff880000);
        assert_eq!(set_color_alpha(0xff880000, 1.0), 0xff8800ff);
    }

    #[test]
    fn clamps_and_rounds_to_8_bits() {
        assert_eq!(set_color_alpha(0x112233ff, 2.0), 0x112233ff);
        // 8-bit quantization: 0.5 * 255 rounds to 128, and 128/255 = 0.5019608.
        // Allow the inherent 1-LSB quantization error (~1/255 ≈ 0.004).
        let alpha = get_color_alpha(set_color_alpha(0x112233ff, 0.5));
        let diff = (alpha - 0.5).abs();
        assert!(diff < 0.005, "expected alpha near 0.5, got {alpha} (diff: {diff})");
    }
}

mod unpack_color_rgba {
    use super::*;

    #[test]
    fn extracts_white_as_all_ones() {
        let mut out = [0.0_f32; 4];
        unpack_color_rgba(&mut out, 0xffffffff);
        assert_approx_tight(out[0], 1.0);
        assert_approx_tight(out[1], 1.0);
        assert_approx_tight(out[2], 1.0);
        assert_approx_tight(out[3], 1.0);
    }

    #[test]
    fn does_not_gamma_decode_mid_srgb_stays_above_the_linear_midpoint() {
        let mut out = [0.0_f32; 4];
        unpack_color_rgba(&mut out, 0x808080ff);
        assert_approx(out[0], 0x80 as f32 / 0xff as f32);
    }
}

mod unpack_color_to_linear {
    use super::*;

    #[test]
    fn decodes_white_and_black_exactly_at_the_endpoints() {
        let mut out = allocate_linear_color();
        unpack_color_to_linear(&mut out, 0xffffffff);
        assert_eq!(out.r, 1.0);
        assert_eq!(out.g, 1.0);
        assert_eq!(out.b, 1.0);
        assert_eq!(out.a, 1.0);

        unpack_color_to_linear(&mut out, 0x000000ff);
        assert_eq!(out.r, 0.0);
        assert_eq!(out.g, 0.0);
        assert_eq!(out.b, 0.0);
        assert_eq!(out.a, 1.0);
    }

    #[test]
    fn passes_alpha_through_linearly_without_gamma_decode() {
        let mut out = allocate_linear_color();
        unpack_color_to_linear(&mut out, 0x00000080);
        assert_approx_tight(out.a, 0x80 as f32 / 0xff as f32);
    }

    #[test]
    fn gamma_decodes_rgb_so_mid_srgb_is_below_the_linear_midpoint() {
        let mut out = allocate_linear_color();
        unpack_color_to_linear(&mut out, 0x808080ff);
        assert_approx(out.r, 0.21586);
        assert_eq!(out.r, out.g);
        assert_eq!(out.g, out.b);
    }
}
