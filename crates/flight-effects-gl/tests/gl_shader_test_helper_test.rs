mod evaluate_glsl_scalar_expression {
    use flight_effects_gl::contract::evaluate_glsl_scalar_expression;

    use crate::assert_close;
    use crate::{bindings, expect_error};

    #[test]
    fn substitutes_every_binding_and_evaluates_the_arithmetic() {
        let value = evaluate_glsl_scalar_expression(
            "abs((1.0 - v_texCoord.y) - u_center)",
            &bindings(&[("u_center", 0.25), ("v_texCoord.y", 0.75)]),
        );
        // D1 f32 bound (TS: toBeCloseTo(0, 10))
        assert_close(value, 0.0, 0.5e-10);
    }

    #[test]
    fn gives_a_different_answer_for_the_two_vertical_origins() {
        let value = evaluate_glsl_scalar_expression(
            "abs(v_texCoord.y - u_center)",
            &bindings(&[("u_center", 0.25), ("v_texCoord.y", 0.75)]),
        );
        // D1 f32 bound (TS: toBeCloseTo(0.5, 10))
        assert_close(value, 0.5, 0.5e-10);
    }

    #[test]
    fn binds_the_longest_name_first() {
        let value = evaluate_glsl_scalar_expression(
            "u_scale + u_scaleFactor",
            &bindings(&[("u_scale", 2.0), ("u_scaleFactor", 30.0)]),
        );
        assert_eq!(value, 32.0);
    }

    #[test]
    fn resolves_the_scalar_builtins() {
        let value = evaluate_glsl_scalar_expression(
            "clamp(mix(0.0, 4.0, t), 0.0, 1.0)",
            &bindings(&[("t", 0.125)]),
        );
        // D1 f32 bound (TS: toBeCloseTo(0.5, 10))
        assert_close(value, 0.5, 0.5e-10);
    }

    #[test]
    fn throws_on_an_identifier_it_was_given_no_binding_for() {
        expect_error(
            || {
                evaluate_glsl_scalar_expression(
                    "u_center * u_density",
                    &bindings(&[("u_center", 1.0)]),
                );
            },
            "no binding for",
        );
    }

    #[test]
    fn throws_rather_than_modelling_an_operator_glsl_and_javascript_disagree_about() {
        expect_error(
            || {
                evaluate_glsl_scalar_expression(
                    "texture(u_texture0, uv).r",
                    &bindings(&[("uv", 0.0)]),
                );
            },
            "no binding for",
        );
    }
}

mod extract_glsl_expression {
    use flight_effects_gl::contract::extract_glsl_expression;
    use flight_regexp::create_reg_exp;

    use crate::expect_error;

    #[test]
    fn returns_the_captured_expression() {
        let pattern = create_reg_exp("float d = ([^;]+);", "");
        assert_eq!(
            extract_glsl_expression("float d = abs(x - 1.0);", &pattern),
            "abs(x - 1.0)"
        );
    }

    #[test]
    fn throws_when_the_pattern_matches_nothing() {
        expect_error(
            || {
                let pattern = create_reg_exp("float e = ([^;]+);", "");
                extract_glsl_expression("float d = 1.0;", &pattern);
            },
            "matched no expression",
        );
    }
}
