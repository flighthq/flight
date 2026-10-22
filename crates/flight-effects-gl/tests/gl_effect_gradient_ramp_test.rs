mod create_gl_effect_gradient_ramp_texture {
    use flight_effects_gl::contract::create_gl_effect_gradient_ramp_texture;

    use crate::gl_test_helper::{calls_named, calls_with, clear_calls, make_gl};

    fn ramp_for(colors: &[u32], alphas: &[f32], ratios: &[f32]) -> Vec<u8> {
        let gl = make_gl();
        create_gl_effect_gradient_ramp_texture(
            &gl,
            &colors.to_vec(),
            &alphas.to_vec(),
            &ratios.to_vec(),
        )
        .unwrap();
        return calls_with("tex_image_2d").pop().unwrap().bytes;
    }

    fn entry_at(ramp: &[u8], index: usize) -> Vec<u8> {
        return ramp[index * 4..index * 4 + 4].to_vec();
    }

    #[test]
    fn builds_a_256_entry_rgba_table() {
        assert_eq!(
            ramp_for(&[0x000000, 0xffffff], &[1.0, 1.0], &[0.0, 255.0]).len(),
            256 * 4
        );
    }

    #[test]
    fn places_a_stop_at_its_byte_scale_ratio_not_at_a_normalised_one() {
        let ramp = ramp_for(
            &[0x000000, 0xff0000, 0x000000],
            &[1.0, 1.0, 1.0],
            &[0.0, 64.0, 255.0],
        );
        assert_eq!(entry_at(&ramp, 64), vec![255, 0, 0, 255]);
        assert!(entry_at(&ramp, 32)[0] < 255);
        assert!(entry_at(&ramp, 128)[0] < 255);
    }

    #[test]
    fn holds_the_first_colour_below_the_first_stop_and_the_last_above_the_last() {
        let ramp = ramp_for(&[0x112233, 0x445566], &[0.5, 1.0], &[64.0, 192.0]);
        assert_eq!(entry_at(&ramp, 0), vec![0x11, 0x22, 0x33, 128]);
        assert_eq!(entry_at(&ramp, 63), vec![0x11, 0x22, 0x33, 128]);
        assert_eq!(entry_at(&ramp, 255), vec![0x44, 0x55, 0x66, 255]);
    }

    #[test]
    fn interpolates_linearly_between_two_stops() {
        let ramp = ramp_for(&[0x000000, 0xffffff], &[1.0, 1.0], &[0.0, 255.0]);
        assert_eq!(entry_at(&ramp, 128), vec![128, 128, 128, 255]);
        assert_eq!(entry_at(&ramp, 64), vec![64, 64, 64, 255]);
    }

    #[test]
    fn ramps_alpha_independently_of_colour() {
        let ramp = ramp_for(&[0x808080, 0x808080], &[0.0, 1.0], &[0.0, 255.0]);
        assert_eq!(entry_at(&ramp, 0), vec![128, 128, 128, 0]);
        assert_eq!(entry_at(&ramp, 128), vec![128, 128, 128, 128]);
        assert_eq!(entry_at(&ramp, 255), vec![128, 128, 128, 255]);
    }

    #[test]
    fn reads_a_colour_as_packed_rgb_with_the_alpha_supplied_separately() {
        let ramp = ramp_for(&[0x112233], &[1.0], &[0.0]);
        assert_eq!(entry_at(&ramp, 0), vec![0x11, 0x22, 0x33, 255]);
    }

    #[test]
    fn returns_a_transparent_table_for_no_stops_at_all_rather_than_failing() {
        let ramp = ramp_for(&[], &[], &[]);
        assert_eq!(entry_at(&ramp, 0), vec![0, 0, 0, 0]);
        assert_eq!(entry_at(&ramp, 255), vec![0, 0, 0, 0]);
    }

    #[test]
    fn resolves_a_zero_width_span_to_the_stop_that_ends_it_instead_of_dividing_by_zero() {
        let ramp = ramp_for(
            &[0xff0000, 0x00ff00, 0x0000ff, 0xffffff],
            &[1.0, 1.0, 1.0, 1.0],
            &[0.0, 64.0, 64.0, 255.0],
        );
        assert_eq!(entry_at(&ramp, 64), vec![0, 255, 0, 255]);
    }

    #[test]
    fn samples_the_table_smoothly_and_clamps_at_both_ends() {
        let gl = make_gl();
        create_gl_effect_gradient_ramp_texture(
            &gl,
            &vec![0x000000, 0xffffff],
            &vec![1.0, 1.0],
            &vec![0.0, 255.0],
        )
        .unwrap();
        let parameters: Vec<(i64, i64)> = calls_with("tex_parameter_i")
            .into_iter()
            .map(|call| (call.integers[1], call.integers[2]))
            .collect();
        assert!(
            parameters.contains(&(i64::from(glow::TEXTURE_MIN_FILTER), i64::from(glow::LINEAR)))
        );
        assert!(
            parameters.contains(&(i64::from(glow::TEXTURE_MAG_FILTER), i64::from(glow::LINEAR)))
        );
        assert!(parameters.contains(&(
            i64::from(glow::TEXTURE_WRAP_S),
            i64::from(glow::CLAMP_TO_EDGE)
        )));
        assert!(parameters.contains(&(
            i64::from(glow::TEXTURE_WRAP_T),
            i64::from(glow::CLAMP_TO_EDGE)
        )));
    }

    #[test]
    fn allocates_a_new_texture_per_call_since_the_caller_owns_it() {
        let gl = make_gl();
        clear_calls();
        let first =
            create_gl_effect_gradient_ramp_texture(&gl, &vec![0x000000], &vec![1.0], &vec![0.0])
                .unwrap();
        let second =
            create_gl_effect_gradient_ramp_texture(&gl, &vec![0x000000], &vec![1.0], &vec![0.0])
                .unwrap();
        assert_ne!(first, second);
        assert_eq!(calls_named("gen_textures"), 2);
    }
}
