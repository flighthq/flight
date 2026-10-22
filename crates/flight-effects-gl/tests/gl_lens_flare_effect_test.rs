use flight_effects::create_lens_flare_effect;
use flight_effects_gl::contract::apply_lens_flare_effect_to_gl;
use flight_regexp::{create_reg_exp, exec_reg_exp};

use crate::gl_test_helper::{
    clear_calls, draws, make_state, make_texture_target, shader_source_containing,
};

fn shader_source() -> String {
    let mut state = make_state();
    let target = make_texture_target(&state, 8.0, 8.0);
    apply_lens_flare_effect_to_gl(
        &mut state,
        &target,
        &target,
        &create_lens_flare_effect().read().unwrap(),
    )
    .unwrap();
    return shader_source_containing("u_ghosts");
}

fn normalize_direction(vector: [f32; 2], epsilon: [f32; 2]) -> [f32; 2] {
    let x = vector[0] + epsilon[0];
    let y = vector[1] + epsilon[1];
    let length = x.hypot(y);
    return [x / length, y / length];
}

fn read_shader_epsilon() -> [f32; 2] {
    let pattern = create_reg_exp(r"normalize\(toCenter \+ vec2\(([^,]+), ([^)]+)\)\)", "");
    let matched = exec_reg_exp(&pattern, &shader_source())
        .expect("lens_flare shader lost its explicit two-axis halo normalize epsilon");
    let x: f32 = matched.matches[1]
        .as_deref()
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    let y: f32 = matched.matches[2]
        .as_deref()
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert!(x.is_finite() && y.is_finite());
    return [x, y];
}

mod apply_lens_flare_effect_to_gl {
    use super::*;
    use crate::assert_close;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let target = make_texture_target(&state, 8.0, 8.0);
        clear_calls();
        apply_lens_flare_effect_to_gl(
            &mut state,
            &target,
            &target,
            &create_lens_flare_effect().read().unwrap(),
        )
        .unwrap();
        assert_eq!(draws().len(), 1);
    }

    #[test]
    fn pins_the_halo_normalize_epsilon_sign_at_and_near_zero_input() {
        let unguarded_center = normalize_direction([0.0, 0.0], [0.0, 0.0]);
        let pre_fix_center = normalize_direction([0.0, 0.0], [1e-5, 1e-5]);
        let epsilon = read_shader_epsilon();
        let fixed_center = normalize_direction([0.0, 0.0], epsilon);
        let fixed_near_center = normalize_direction([1e-6, 1e-6], epsilon);
        let sqrt1_2 = std::f32::consts::FRAC_1_SQRT_2;

        assert!(unguarded_center.iter().all(|value| value.is_nan()));
        // D1 f32 bound (TS: toBeCloseTo(x, 8))
        assert_close(pre_fix_center[0], sqrt1_2, 0.5e-8);
        assert_close(pre_fix_center[1], sqrt1_2, 0.5e-8);
        assert_close(fixed_center[0], sqrt1_2, 0.5e-8);
        assert_close(fixed_center[1], -sqrt1_2, 0.5e-8);
        assert_close(fixed_near_center[0], 11.0 / 202.0_f32.sqrt(), 0.5e-8);
        assert_close(fixed_near_center[1], -9.0 / 202.0_f32.sqrt(), 0.5e-8);
        // D1 f32 bound (TS: toBeCloseTo(1, 12))
        assert_close(fixed_center[0].hypot(fixed_center[1]), 1.0, 0.5e-12);
        assert_close(
            fixed_near_center[0].hypot(fixed_near_center[1]),
            1.0,
            0.5e-12,
        );
    }
}

mod gl_lens_flare_effect_runner {
    use flight_effects_gl::contract::gl_lens_flare_effect_runner;

    use super::*;
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_lens_flare_effect();
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_lens_flare_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
    }
}

mod register_gl_lens_flare_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_lens_flare_effect_runner,
        register_gl_lens_flare_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        register_gl_lens_flare_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "LensFlareEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_lens_flare_effect_runner as GlEffectRunner
        ));
    }
}
