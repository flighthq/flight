use flight_effects::{RadialBlurEffect, create_radial_blur_effect};
use flight_effects_gl::contract::apply_radial_blur_effect_to_gl;
use flight_entity::Ref;
use flight_render_gl::GlRenderState;

use crate::gl_test_helper::{clear_calls, last_uniform, make_state, make_texture_target};

fn radial_blur_effect(
    center_x: Option<f32>,
    center_y: Option<f32>,
    samples: Option<f32>,
) -> Ref<RadialBlurEffect> {
    let effect = create_radial_blur_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.center_x = center_x;
        effect.center_y = center_y;
        effect.samples = samples;
    }
    return effect;
}

fn apply_on(state: &mut GlRenderState, effect: &Ref<RadialBlurEffect>) {
    let target = make_texture_target(state, 64.0, 64.0);
    clear_calls();
    apply_radial_blur_effect_to_gl(state, &target, &target, &effect.read().unwrap()).unwrap();
}

fn center(center_x: Option<f32>, center_y: Option<f32>) -> Vec<f32> {
    let mut state = make_state();
    apply_on(&mut state, &radial_blur_effect(center_x, center_y, None));
    return last_uniform("u_center");
}

mod apply_radial_blur_effect_to_gl {
    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::linked_programs;

    #[test]
    fn converts_a_top_left_center_y_into_this_backend_bottom_left_texcoord_space() {
        let value = center(Some(0.3), Some(0.4));
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(value[0], 0.3, 0.5e-6);
        assert_close(value[1], 0.6, 0.5e-6);
    }

    #[test]
    fn keeps_a_centre_near_the_top_of_the_frame_near_the_top() {
        // D1 f32 bound (TS: toBeCloseTo(0.95, 6))
        assert_close(center(None, Some(0.05))[1], 0.95, 0.5e-6);
    }

    #[test]
    fn maps_a_higher_centre_to_a_larger_texcoord_than_a_lower_one() {
        let high = center(None, Some(0.1))[1];
        let low = center(None, Some(0.9))[1];
        assert!(high > low);
    }

    #[test]
    fn defaults_to_the_frame_centre_the_one_value_the_conversion_cannot_be_seen_at() {
        assert_eq!(center(None, None), vec![0.5, 0.5]);
    }

    #[test]
    fn passes_strength_and_sample_count_through_as_descriptor_defaults() {
        let mut state = make_state();
        apply_on(&mut state, &radial_blur_effect(None, None, None));
        assert_eq!(last_uniform("u_strength"), vec![0.2]);
        assert_eq!(last_uniform("u_samples"), vec![16.0]);
    }

    #[test]
    fn compiles_one_program_for_the_effect_regardless_of_the_descriptor() {
        let mut state = make_state();
        let target = make_texture_target(&state, 64.0, 64.0);
        clear_calls();
        let first = radial_blur_effect(None, None, Some(8.0));
        let second = radial_blur_effect(None, None, Some(32.0));
        apply_radial_blur_effect_to_gl(&mut state, &target, &target, &first.read().unwrap())
            .unwrap();
        apply_radial_blur_effect_to_gl(&mut state, &target, &target, &second.read().unwrap())
            .unwrap();
        assert_eq!(linked_programs(), 1);
    }
}

mod gl_radial_blur_effect_runner {
    use flight_effects_gl::contract::gl_radial_blur_effect_runner;

    use super::*;
    use crate::assert_close;
    use crate::with_effect_context;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_state();
        let effect = radial_blur_effect(None, Some(0.25), None);
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_radial_blur_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        // D1 f32 bound (TS: toBeCloseTo(0.75, 6))
        assert_close(last_uniform("u_center")[1], 0.75, 0.5e-6);
    }
}

mod register_gl_radial_blur_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_radial_blur_effect_runner,
        register_gl_radial_blur_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_radial_blur_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "RadialBlurEffect").is_none());
        register_gl_radial_blur_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "RadialBlurEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_radial_blur_effect_runner as GlEffectRunner
        ));
    }
}
