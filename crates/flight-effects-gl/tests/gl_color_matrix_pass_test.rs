use flight_effects_gl::contract::{
    apply_color_matrix_pass_to_gl, evaluate_glsl_scalar_expression, extract_glsl_expression,
};
use flight_regexp::create_reg_exp;

use crate::bindings;
use crate::gl_test_helper::{
    clear_calls, make_state, make_texture_target, shader_source_containing, uniform_values,
};

const ZEROS_15: [f32; 15] = [0.0; 15];
const IDENTITY: [f32; 20] = [
    1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    0.0,
];

fn uploaded_matrix(matrix: &[f32]) -> Vec<f32> {
    let mut state = make_state();
    let target = make_texture_target(&state, 8.0, 8.0);
    clear_calls();
    apply_color_matrix_pass_to_gl(&mut state, &target, &target, &matrix.to_vec()).unwrap();
    return uniform_values("u_colorMatrix")
        .pop()
        .expect("no uniform1fv call for u_colorMatrix");
}

fn shader_source() -> String {
    let mut state = make_state();
    let target = make_texture_target(&state, 8.0, 8.0);
    apply_color_matrix_pass_to_gl(&mut state, &target, &target, &IDENTITY.to_vec()).unwrap();
    return shader_source_containing("u_colorMatrix[20]");
}

fn row(prefix: &[f32]) -> Vec<f32> {
    let mut out = prefix.to_vec();
    out.extend_from_slice(&ZEROS_15);
    return out;
}

/// Evaluates one output channel of the SHIPPED shader for a given matrix and input colour.
fn channel_value(channel: &str, matrix: &[f32], colour: [f32; 4]) -> f32 {
    let source = shader_source();
    let expression = extract_glsl_expression(
        &source,
        &create_reg_exp(&format!("float {channel} = ([^;]+);"), ""),
    );
    let mut entries: Vec<(String, f32)> = vec![
        ("r".to_string(), colour[0]),
        ("g".to_string(), colour[1]),
        ("b".to_string(), colour[2]),
        ("a".to_string(), colour[3]),
    ];
    for index in 0..20 {
        entries.push((
            format!("u_colorMatrix[{index}]"),
            matrix.get(index).copied().unwrap_or(0.0),
        ));
    }
    let refs: Vec<(&str, f32)> = entries
        .iter()
        .map(|(key, value)| (key.as_str(), *value))
        .collect();
    return evaluate_glsl_scalar_expression(&expression, &bindings(&refs));
}

mod apply_color_matrix_pass_to_gl {
    use super::*;
    use crate::assert_close;

    #[test]
    fn uploads_exactly_twenty_coefficients() {
        assert_eq!(uploaded_matrix(&IDENTITY).len(), 20);
    }

    #[test]
    fn reads_row_major_so_indices_0_to_4_are_the_red_output_row() {
        let green_into_red = row(&[0.0, 1.0, 0.0, 0.0, 0.0]);
        // D1 f32 bound (TS: toBeCloseTo(0.75, 6))
        assert_close(
            channel_value("nr", &green_into_red, [0.1, 0.75, 0.25, 1.0]),
            0.75,
            0.5e-6,
        );
    }

    #[test]
    fn gives_each_output_channel_its_own_row_five_apart() {
        let rotated = [
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        let colour = [0.1, 0.75, 0.25, 0.5];
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(channel_value("ng", &rotated, colour), 0.25, 0.5e-6);
        assert_close(channel_value("nb", &rotated, colour), 0.1, 0.5e-6);
        assert_close(channel_value("na", &rotated, colour), 0.5, 0.5e-6);
    }

    #[test]
    fn multiplies_column_four_by_alpha_and_adds_column_five_unmultiplied() {
        let alpha_only = row(&[0.0, 0.0, 0.0, 1.0, 0.0]);
        let bias_only = row(&[0.0, 0.0, 0.0, 0.0, 0.3]);
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(
            channel_value("nr", &alpha_only, [0.0, 0.0, 0.0, 0.5]),
            0.5,
            0.5e-6,
        );
        assert_close(
            channel_value("nr", &bias_only, [0.0, 0.0, 0.0, 0.5]),
            0.3,
            0.5e-6,
        );
        assert_close(
            channel_value("nr", &bias_only, [0.0, 0.0, 0.0, 1.0]),
            0.3,
            0.5e-6,
        );
    }

    #[test]
    fn leaves_an_identity_matrix_colour_untouched() {
        let colour = [0.1, 0.25, 0.75, 0.5];
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(channel_value("nr", &IDENTITY, colour), 0.1, 0.5e-6);
        assert_close(channel_value("ng", &IDENTITY, colour), 0.25, 0.5e-6);
        assert_close(channel_value("nb", &IDENTITY, colour), 0.75, 0.5e-6);
        assert_close(channel_value("na", &IDENTITY, colour), 0.5, 0.5e-6);
    }

    #[test]
    fn zero_fills_a_matrix_shorter_than_twenty() {
        let uploaded = uploaded_matrix(&[1.0, 0.0, 0.0, 0.0]);
        assert_eq!(uploaded[4], 0.0);
        assert_eq!(uploaded[19], 0.0);
        assert_eq!(uploaded.len(), 20);
    }

    #[test]
    fn ignores_coefficients_past_the_twentieth() {
        let mut long = IDENTITY.to_vec();
        long.extend_from_slice(&[99.0, 98.0]);
        assert_eq!(uploaded_matrix(&long), IDENTITY.to_vec());
    }

    #[test]
    fn compiles_one_program_for_every_matrix_since_the_coefficients_are_a_uniform() {
        let mut state = make_state();
        let target = make_texture_target(&state, 8.0, 8.0);
        clear_calls();
        apply_color_matrix_pass_to_gl(&mut state, &target, &target, &IDENTITY.to_vec()).unwrap();
        apply_color_matrix_pass_to_gl(
            &mut state,
            &target,
            &target,
            &row(&[2.0, 0.0, 0.0, 0.0, 0.0]).to_vec(),
        )
        .unwrap();
        assert_eq!(crate::gl_test_helper::linked_programs(), 1);
    }
}
