use flight_color::contract::*;

mod contract_re_exports {
    use super::*;

    #[test]
    fn exposes_all_color_from_kelvin_functions() {
        let _color = color_from_kelvin(6500.0);
    }

    #[test]
    fn exposes_all_hsl_functions_and_types() {
        let mut hsl = allocate_hsl_color();
        rgb_to_hsl(&mut hsl, 0xff0000ff);
        let mut out = [0.0_f32; 4];
        hsl_to_rgb(&mut out, hsl.h, hsl.s, hsl.l);
    }

    #[test]
    fn exposes_all_hsv_functions_and_types() {
        let mut hsv = allocate_hsv_color();
        rgb_to_hsv(&mut hsv, 0x00ff00ff);
        let mut out = [0.0_f32; 4];
        hsv_to_rgb(&mut out, hsv.h, hsv.s, hsv.v);
    }

    #[test]
    fn exposes_all_lerp_functions() {
        let _c = lerp_color(0x000000ff, 0xffffffff, 0.5);
        let mut out = allocate_linear_color();
        let start = allocate_linear_color();
        let end = allocate_linear_color();
        lerp_linear_color(&mut out, &start, &end, 0.5);
    }

    #[test]
    fn exposes_all_luminance_functions() {
        let _lum = get_color_luminance(0xffffffff);
        let _ratio = get_color_contrast_ratio(0xffffffff, 0x000000ff);
        let mut w709 = [0.0_f32; 3];
        get_rec709_luminance_weights(&mut w709);
        let mut w2020 = [0.0_f32; 3];
        get_rec2020_luminance_weights(&mut w2020);
    }

    #[test]
    fn exposes_all_oklab_functions() {
        let mut lab = [0.0_f32; 3];
        linear_rgb_to_oklab(&mut lab, 1.0, 0.0, 0.0);
        let mut rgb = [0.0_f32; 3];
        oklab_to_linear_rgb(&mut rgb, lab[0], lab[1], lab[2]);
        let (r, g, b) = (rgb[0], rgb[1], rgb[2]);
        clamp_linear_rgb(&mut rgb, r, g, b);
    }

    #[test]
    fn exposes_all_pack_functions_and_types() {
        let mut linear = allocate_linear_color();
        unpack_color_to_linear(&mut linear, 0xff8800ff);
        let _packed = pack_linear_to_color(&linear);
        let _packed2 = pack_color(1.0, 0.0, 0.0, 1.0);
        let _opaque = pack_opaque_color(0xff8800);
        let _alpha = get_color_alpha(0xff8800ff);
        let _rgb = get_color_rgb(0xff8800ff);
        let _with_alpha = set_color_alpha(0xff8800ff, 0.5);
        let _hex = compute_rgb_hex_string(0xff8800);
        let _css = compute_rgba_css_string(0xff8800ff);
        let mut rgba = [0.0_f32; 4];
        unpack_color_rgba(&mut rgba, 0xff8800ff);
    }

    #[test]
    fn exposes_all_premultiply_functions() {
        let _pm = premultiply_color_alpha(0xff880080);
        let _upm = unpremultiply_color_alpha(0xff880080);
    }

    #[test]
    fn exposes_all_srgb_transfer_functions() {
        let _s = linear_channel_to_srgb(0.5);
        let _l = srgb_channel_to_linear(0.5);
    }
}
