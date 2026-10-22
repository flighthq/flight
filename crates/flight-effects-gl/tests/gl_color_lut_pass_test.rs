use flight_adjustments::ColorLut;
use flight_effects_gl::contract::{
    GlColorLutTextureCache, apply_color_lut_pass_to_gl, evaluate_glsl_scalar_expression,
    extract_glsl_expression,
};
use flight_regexp::create_reg_exp;
use flight_render_gl::GlRenderState;

use crate::bindings;
use crate::gl_test_helper::{make_state, make_texture_target, shader_source_containing};

fn create_lut(size: u32, samples: &[f32]) -> ColorLut {
    return ColorLut {
        size,
        samples: samples.to_vec(),
    };
}

fn create_identity_lut() -> ColorLut {
    let mut samples = Vec::new();
    for index in 0..8 {
        let value = index as f32 / 7.0;
        samples.extend_from_slice(&[value, value, value]);
    }
    return create_lut(2, &samples);
}

fn empty_cache() -> GlColorLutTextureCache {
    return GlColorLutTextureCache {
        texture: None,
        lut: None,
    };
}

fn apply(state: &mut GlRenderState, lut: &ColorLut, cache: &mut GlColorLutTextureCache) {
    let target = make_texture_target(state, 8.0, 8.0);
    apply_color_lut_pass_to_gl(state, &target, &target, lut, cache).unwrap();
}

fn shader_source() -> String {
    let mut state = make_state();
    apply(&mut state, &create_identity_lut(), &mut empty_cache());
    return shader_source_containing("u_lutSize");
}

fn lut_coordinate_at(colour: f32, size: f32) -> f32 {
    let source = shader_source();
    let scale = evaluate_glsl_scalar_expression(
        &extract_glsl_expression(&source, &create_reg_exp("float scale = ([^;]+);", "")),
        &bindings(&[("u_lutSize", size)]),
    );
    let offset = evaluate_glsl_scalar_expression(
        &extract_glsl_expression(&source, &create_reg_exp("float offset = ([^;]+);", "")),
        &bindings(&[("u_lutSize", size)]),
    );
    return evaluate_glsl_scalar_expression(
        &extract_glsl_expression(&source, &create_reg_exp("vec3 lc = ([^;]+);", "")),
        &bindings(&[
            ("clamp(c.rgb, 0.0, 1.0)", colour),
            ("offset", offset),
            ("scale", scale),
        ]),
    );
}

fn uploads() -> Vec<Vec<u8>> {
    return crate::gl_test_helper::calls_with("tex_image_3d")
        .into_iter()
        .map(|call| call.bytes)
        .collect();
}

mod apply_color_lut_pass_to_gl {
    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::{calls_with, snapshot};

    #[test]
    fn maps_black_to_the_first_cell_centre_and_white_to_the_last() {
        // D1 f32 bound (TS: toBeCloseTo(x, 10))
        assert_close(lut_coordinate_at(0.0, 8.0), 0.5 / 8.0, 0.5e-10);
        assert_close(lut_coordinate_at(1.0, 8.0), 7.5 / 8.0, 0.5e-10);
    }

    #[test]
    fn keeps_the_mapping_affine_between_the_two_ends() {
        // D1 f32 bound (TS: toBeCloseTo(x, 10))
        assert_close(
            lut_coordinate_at(0.5, 8.0),
            (0.5 / 8.0 + 7.5 / 8.0) / 2.0,
            0.5e-10,
        );
        assert_close(
            lut_coordinate_at(0.5, 32.0),
            (0.5 / 32.0 + 31.5 / 32.0) / 2.0,
            0.5e-10,
        );
    }

    #[test]
    fn uploads_the_lut_as_rgba8_with_samples_scaled_to_bytes_and_alpha_forced_opaque() {
        let mut state = make_state();
        let samples: Vec<f32> = (0..24).map(|index| (index % 3) as f32 / 2.0).collect();
        apply(&mut state, &create_lut(2, &samples), &mut empty_cache());
        assert_eq!(
            uploads()[0][0..8].to_vec(),
            vec![0, 128, 255, 255, 0, 128, 255, 255]
        );
    }

    #[test]
    fn clamps_a_sample_outside_zero_to_one_rather_than_wrapping_it() {
        let mut state = make_state();
        let mut samples = vec![0.0_f32; 24];
        samples[0] = -0.5;
        samples[1] = 1.5;
        apply(&mut state, &create_lut(2, &samples), &mut empty_cache());
        assert_eq!(uploads()[0][0..2].to_vec(), vec![0, 255]);
    }

    // TS models "changed" with a second, content-identical LUT object (identity memo). The Rust
    // `ColorLut` is a value, so the memo compares content: an unchanged run is the same content and a
    // changed run is different content.
    #[test]
    fn uploads_once_for_an_unchanged_lut_and_re_uploads_when_it_changes() {
        let mut state = make_state();
        let mut cache = empty_cache();
        let lut = create_identity_lut();
        apply(&mut state, &lut, &mut cache);
        apply(&mut state, &lut, &mut cache);
        assert_eq!(uploads().len(), 1);
        let mut changed = create_identity_lut();
        changed.samples[0] = 0.5;
        apply(&mut state, &changed, &mut cache);
        assert_eq!(uploads().len(), 2);
    }

    #[test]
    fn reuses_the_cache_one_texture_across_lut_changes_instead_of_leaking_a_new_one() {
        let mut state = make_state();
        let mut cache = empty_cache();
        let target = make_texture_target(&state, 8.0, 8.0);
        apply_color_lut_pass_to_gl(
            &mut state,
            &target,
            &target,
            &create_identity_lut(),
            &mut cache,
        )
        .unwrap();
        let texture = cache.texture;
        let generated = crate::gl_test_helper::calls_named("gen_textures");
        let mut changed = create_identity_lut();
        changed.samples[0] = 0.5;
        apply_color_lut_pass_to_gl(&mut state, &target, &target, &changed, &mut cache).unwrap();
        assert_eq!(
            crate::gl_test_helper::calls_named("gen_textures"),
            generated
        );
        assert_eq!(cache.texture, texture);
        assert_eq!(uploads().len(), 2);
    }

    #[test]
    fn filters_the_lut_linearly_and_clamps_on_all_three_axes() {
        let mut state = make_state();
        apply(&mut state, &create_identity_lut(), &mut empty_cache());
        let parameters: Vec<(i64, i64)> = calls_with("tex_parameter_i")
            .into_iter()
            .filter(|call| call.integers[0] == i64::from(glow::TEXTURE_3D))
            .map(|call| (call.integers[1], call.integers[2]))
            .collect();
        let linear = i64::from(glow::LINEAR);
        let clamp = i64::from(glow::CLAMP_TO_EDGE);
        assert!(parameters.contains(&(i64::from(glow::TEXTURE_MIN_FILTER), linear)));
        assert!(parameters.contains(&(i64::from(glow::TEXTURE_MAG_FILTER), linear)));
        assert!(parameters.contains(&(i64::from(glow::TEXTURE_WRAP_S), clamp)));
        assert!(parameters.contains(&(i64::from(glow::TEXTURE_WRAP_T), clamp)));
        assert!(parameters.contains(&(i64::from(glow::TEXTURE_WRAP_R), clamp)));
    }

    #[test]
    fn binds_the_lut_to_unit_one_and_restores_unit_zero_before_returning() {
        let mut state = make_state();
        let mut cache = empty_cache();
        apply(&mut state, &create_identity_lut(), &mut cache);
        assert_eq!(crate::gl_test_helper::last_uniform("u_lut"), vec![1.0]);
        let calls = snapshot().call_details;
        let lut_name = i64::from(cache.texture.unwrap().0.get());
        let bind_index = calls
            .iter()
            .rposition(|call| {
                call.name == "bind_texture"
                    && call.integers == vec![i64::from(glow::TEXTURE_3D), lut_name]
            })
            .unwrap();
        let before = calls[..bind_index]
            .iter()
            .rev()
            .find(|call| call.name == "active_texture")
            .unwrap();
        let after = calls[bind_index..]
            .iter()
            .find(|call| call.name == "active_texture")
            .unwrap();
        assert_eq!(before.integers, vec![i64::from(glow::TEXTURE1)]);
        assert_eq!(after.integers, vec![i64::from(glow::TEXTURE0)]);
    }
}
