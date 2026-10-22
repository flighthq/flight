use std::f32::consts::PI;

use flight_effects::{EffectRef, HalftoneEffect, create_halftone_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

const SOURCE_WIDTH: u32 = 128;
const SOURCE_HEIGHT: u32 = 64;

// Applies a halftone with `configure` applied to a fresh descriptor and returns the first uploaded
// uniform slot.
fn apply(configure: impl FnOnce(&mut HalftoneEffect)) -> Vec<f32> {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
    let dest = create_test_target(&state, SOURCE_WIDTH, SOURCE_HEIGHT);
    let effect = create_halftone_effect();
    configure(&mut effect.write().unwrap());
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_halftone_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    return recorded_effect_uniforms(&records).remove(0);
}

// A local evaluator for the one-line wrap expression (`+ - * /`, parentheses, `floor`, and the
// bindings), so the assertions are about the shader text that compiles.
fn evaluate_wgsl_scalar_expression(expression: &str, bindings: &[(&str, f64)]) -> f64 {
    let tokens = tokenize(expression);
    let mut position = 0;
    let value = parse_sum(&tokens, &mut position, bindings);
    assert_eq!(position, tokens.len(), "unparsed tail in: {expression}");
    return value;
}

fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        let c = chars[index];
        if c.is_whitespace() {
            index += 1;
        } else if c.is_ascii_alphanumeric() || c == '_' || c == '.' {
            let start = index;
            while index < chars.len()
                && (chars[index].is_ascii_alphanumeric()
                    || chars[index] == '_'
                    || chars[index] == '.')
            {
                index += 1;
            }
            out.push(chars[start..index].iter().collect());
        } else {
            out.push(c.to_string());
            index += 1;
        }
    }
    return out;
}

fn parse_sum(tokens: &[String], position: &mut usize, bindings: &[(&str, f64)]) -> f64 {
    let mut value = parse_product(tokens, position, bindings);
    while *position < tokens.len() && (tokens[*position] == "+" || tokens[*position] == "-") {
        let op = tokens[*position].clone();
        *position += 1;
        let rhs = parse_product(tokens, position, bindings);
        value = if op == "+" { value + rhs } else { value - rhs };
    }
    return value;
}

fn parse_product(tokens: &[String], position: &mut usize, bindings: &[(&str, f64)]) -> f64 {
    let mut value = parse_atom(tokens, position, bindings);
    while *position < tokens.len() && (tokens[*position] == "*" || tokens[*position] == "/") {
        let op = tokens[*position].clone();
        *position += 1;
        let rhs = parse_atom(tokens, position, bindings);
        value = if op == "*" { value * rhs } else { value / rhs };
    }
    return value;
}

fn parse_atom(tokens: &[String], position: &mut usize, bindings: &[(&str, f64)]) -> f64 {
    let token = tokens[*position].clone();
    *position += 1;
    if token == "(" {
        let value = parse_sum(tokens, position, bindings);
        assert_eq!(tokens[*position], ")");
        *position += 1;
        return value;
    }
    if token == "-" {
        return -parse_atom(tokens, position, bindings);
    }
    if token == "floor" {
        assert_eq!(tokens[*position], "(");
        return parse_atom(tokens, position, bindings).floor();
    }
    if let Some((_, value)) = bindings.iter().find(|(name, _)| *name == token) {
        return *value;
    }
    return token
        .parse()
        .unwrap_or_else(|_| panic!("no binding for '{token}'"));
}

fn wrap_expression() -> String {
    let line = HALFTONE_FRAGMENT_WGSL
        .lines()
        .find(|line| line.trim_start().starts_with("let wrapped = "))
        .expect("halftone shader lost its `wrapped` binding");
    let expression = line.trim_start().trim_start_matches("let wrapped = ");
    return expression
        .trim_end()
        .trim_end_matches(';')
        .trim()
        .to_string();
}

fn wrap_at(coordinate: f64, cell_size: f64) -> f64 {
    return evaluate_wgsl_scalar_expression(
        &wrap_expression(),
        &[("rp", coordinate), ("scale", cell_size)],
    );
}

mod apply_halftone_effect_to_wgpu {
    use super::*;

    // The cell coordinate was once a float remainder, which follows the sign of its left operand:
    // the rotated grid goes negative over much of a frame and the dots stopped being drawn there.
    #[test]
    fn wraps_a_negative_coordinate_into_the_cell_not_to_a_negative_remainder() {
        assert!((wrap_at(-1.0, 6.0) - 5.0).abs() < 1e-10);
        assert!((wrap_at(-7.0, 6.0) - 5.0).abs() < 1e-10);
    }

    #[test]
    fn keeps_every_wrapped_coordinate_inside_one_cell_on_both_sides_of_the_origin() {
        for coordinate in [-13.5, -6.0, -0.25, 0.0, 0.25, 6.0, 13.5] {
            let wrapped = wrap_at(coordinate, 6.0);
            assert!(wrapped >= 0.0);
            assert!(wrapped < 6.0);
        }
    }

    #[test]
    fn agrees_with_a_remainder_where_the_coordinate_is_positive_which_is_why_the_defect_hid() {
        assert!((wrap_at(7.0, 6.0) - 7.0 % 6.0).abs() < 1e-10);
        assert!((wrap_at(13.5, 6.0) - 13.5 % 6.0).abs() < 1e-10);
    }

    #[test]
    fn converts_the_descriptor_angle_from_degrees_into_shader_radians() {
        assert!(is_close(
            apply(|effect| effect.angle = Some(90.0))[1],
            PI / 2.0,
            6
        ));
        assert!(is_close(
            apply(|effect| effect.angle = Some(180.0))[1],
            PI,
            6
        ));
        assert_eq!(apply(|effect| effect.angle = Some(0.0))[1], 0.0);
    }

    #[test]
    fn defaults_to_the_classic_screen_angle_in_degrees() {
        assert!(is_close(apply(|_| {})[1], (22.92 * PI) / 180.0, 6));
    }

    // A cell smaller than a pixel would turn the effect into a solid field.
    #[test]
    fn floors_the_cell_size_at_one_pixel() {
        assert_eq!(apply(|effect| effect.scale = Some(0.0))[0], 1.0);
        assert_eq!(apply(|effect| effect.scale = Some(-4.0))[0], 1.0);
        assert_eq!(apply(|effect| effect.scale = Some(6.0))[0], 6.0);
    }

    // The grid is laid out in PIXELS, so the shader needs the source's dimensions.
    #[test]
    fn gives_the_shader_the_source_resolution_the_grid_is_laid_out_in() {
        let uniforms = apply(|_| {});
        assert_eq!(uniforms[2], SOURCE_WIDTH as f32);
        assert_eq!(uniforms[3], SOURCE_HEIGHT as f32);
    }

    #[test]
    fn draws_through_one_replace_blend_pipeline_for_every_parameterisation() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let records = record_test_commands(&state);
        with_test_frame(&mut state, |state| {
            for scale in [4.0, 12.0] {
                let effect = create_halftone_effect();
                effect.write().unwrap().scale = Some(scale);
                apply_halftone_effect_to_wgpu(
                    state,
                    &source.read().unwrap(),
                    &dest.read().unwrap(),
                    &effect.read().unwrap(),
                );
            }
        });
        let created = recorded_pipelines(&records);
        assert_eq!(created.len(), 1);
        let blend = created[0].targets[0].as_ref().unwrap().blend.unwrap();
        assert_eq!(blend.color.dst_factor, wgpu::BlendFactor::Zero);
        let cached = get_wgpu_effect_pipeline(&mut state, "stylization.halftone", "", None);
        let drawn = recorded_set_pipelines(&records);
        assert_eq!(drawn.len(), 2);
        assert!(
            drawn
                .iter()
                .all(|pipeline| *pipeline == cached.read().unwrap().pipeline)
        );
    }
}

mod register_wgpu_halftone_effect {
    use super::*;

    #[test]
    fn makes_the_runner_resolvable_for_the_halftone_effect_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "HalftoneEffect").is_none());

        register_wgpu_halftone_effect(&mut state);

        let expected: WgpuEffectRunner = wgpu_halftone_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "HalftoneEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_halftone_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = {
            let effect = create_halftone_effect();
            effect.write().unwrap().angle = Some(90.0);
            effect
        };
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            let mut context = WgpuEffectContext {
                state,
                source: source.clone(),
                dest: dest.clone(),
                pool: &mut pool,
                scene_depth_texture: None,
                scene_velocity_texture: None,
            };
            wgpu_halftone_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert!(is_close(
            recorded_effect_uniforms(&records)[0][1],
            PI / 2.0,
            6
        ));
    }
}
