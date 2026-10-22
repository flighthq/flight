use flight_effects::{GodRaysEffect, create_god_rays_effect};
use flight_effects_gl::contract::apply_god_rays_effect_to_gl;
use flight_entity::Ref;
use flight_render_gl::GlRenderState;

use crate::gl_test_helper::{clear_calls, last_uniform, make_state, make_texture_target};

fn god_rays_effect(
    center_x: Option<f32>,
    center_y: Option<f32>,
    samples: Option<f32>,
) -> Ref<GodRaysEffect> {
    let effect = create_god_rays_effect();
    {
        let mut effect = effect.write().unwrap();
        effect.center_x = center_x;
        effect.center_y = center_y;
        effect.samples = samples;
    }
    return effect;
}

fn apply_on(state: &mut GlRenderState, effect: &Ref<GodRaysEffect>) {
    let target = make_texture_target(state, 64.0, 64.0);
    clear_calls();
    apply_god_rays_effect_to_gl(state, &target, &target, &effect.read().unwrap()).unwrap();
}

fn light_position(center_x: Option<f32>, center_y: Option<f32>) -> Vec<f32> {
    let mut state = make_state();
    apply_on(&mut state, &god_rays_effect(center_x, center_y, None));
    return last_uniform("u_lightPosition");
}

mod apply_god_rays_effect_to_gl {
    use super::*;
    use crate::assert_close;
    use crate::gl_test_helper::{linked_programs, shader_sources};

    #[test]
    fn flips_a_top_left_center_y_into_this_backend_bottom_left_texcoord_space() {
        let value = light_position(Some(0.25), Some(0.2));
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(value[0], 0.25, 0.5e-6);
        assert_close(value[1], 0.8, 0.5e-6);
    }

    #[test]
    fn keeps_a_light_near_the_bottom_of_the_frame_near_the_bottom() {
        // D1 f32 bound (TS: toBeCloseTo(0.1, 6))
        assert_close(light_position(None, Some(0.9))[1], 0.1, 0.5e-6);
    }

    #[test]
    fn maps_a_higher_light_to_a_larger_texcoord_than_a_lower_one() {
        let high = light_position(None, Some(0.2))[1];
        let low = light_position(None, Some(0.8))[1];
        assert!(high > low);
    }

    #[test]
    fn defaults_the_light_to_the_frame_centre_the_one_value_the_conversion_cannot_be_seen_at() {
        assert_eq!(light_position(None, None), vec![0.5, 0.5]);
    }

    #[test]
    fn passes_the_marching_parameters_through_as_descriptor_defaults() {
        let mut state = make_state();
        apply_on(&mut state, &god_rays_effect(None, None, None));
        assert_eq!(last_uniform("u_density"), vec![0.96]);
        assert_eq!(last_uniform("u_decay"), vec![0.93]);
        assert_eq!(last_uniform("u_weight"), vec![0.4]);
        assert_eq!(last_uniform("u_exposure"), vec![0.6]);
    }

    // The TS asserts the program key (`atmospheric.godRays.<n>`); the key is not observable through
    // the native cache, so the rounded count is read from the compiled source and the per-count
    // programs are observed as distinct compiles.
    #[test]
    fn rounds_the_sample_count_into_the_program_key_and_floors_it_at_one() {
        let mut state = make_state();
        apply_on(&mut state, &god_rays_effect(None, None, Some(12.4)));
        assert!(
            shader_sources()
                .iter()
                .any(|source| source.contains("const float SAMPLES = 12.0;"))
        );
        apply_on(&mut state, &god_rays_effect(None, None, Some(12.0)));
        assert_eq!(linked_programs(), 0);
        apply_on(&mut state, &god_rays_effect(None, None, Some(0.0)));
        assert_eq!(linked_programs(), 1);
        assert!(
            shader_sources()
                .iter()
                .any(|source| source.contains("const float SAMPLES = 1.0;"))
        );
    }
}

mod gl_god_rays_effect_runner {
    use flight_effects_gl::contract::gl_god_rays_effect_runner;

    use super::*;
    use crate::assert_close;
    use crate::with_effect_context;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_state();
        let effect = god_rays_effect(None, Some(0.25), None);
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_god_rays_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        // D1 f32 bound (TS: toBeCloseTo(0.75, 6))
        assert_close(last_uniform("u_lightPosition")[1], 0.75, 0.5e-6);
    }
}

mod register_gl_god_rays_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_god_rays_effect_runner,
        register_gl_god_rays_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_god_rays_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "GodRaysEffect").is_none());
        register_gl_god_rays_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "GodRaysEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_god_rays_effect_runner as GlEffectRunner
        ));
    }
}
