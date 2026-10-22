use flight_effects::{ScreenSpaceFogEffect, create_screen_space_fog_effect};
use flight_effects_gl::contract::{
    apply_screen_space_fog_effect_to_gl, evaluate_glsl_scalar_expression, extract_glsl_expression,
};
use flight_entity::Ref;
use flight_regexp::create_reg_exp;
use glow::NativeTexture;

use crate::bindings;
use crate::gl_test_helper::{
    clear_calls, draws, last_uniform, make_state, make_texture_target, shader_source_containing,
};

fn fog_effect() -> Ref<ScreenSpaceFogEffect> {
    return create_screen_space_fog_effect();
}

/// Applies the fog to a 64×64 target, optionally with a depth texture; returns the depth used.
fn apply(effect: &Ref<ScreenSpaceFogEffect>, with_depth: bool) -> Option<NativeTexture> {
    let mut state = make_state();
    let target = make_texture_target(&state, 64.0, 64.0);
    let depth = if with_depth {
        Some(flight_render_gl::create_gl_texture(&state).unwrap())
    } else {
        None
    };
    clear_calls();
    apply_screen_space_fog_effect_to_gl(
        &mut state,
        &target,
        &target,
        depth,
        &effect.read().unwrap(),
    )
    .unwrap();
    return depth;
}

fn proxy_fog_expression() -> String {
    apply(&fog_effect(), false);
    let source = shader_source_containing("u_fogColor");
    return extract_glsl_expression(
        &source,
        &create_reg_exp("} else \\{[\\S\\s]*?fog = ([^;]+);", ""),
    );
}

fn proxy_fog_at_texcoord_y(texcoord_y: f32, density: f32) -> f32 {
    return evaluate_glsl_scalar_expression(
        &proxy_fog_expression(),
        &bindings(&[("u_density", density), ("v_texCoord.y", texcoord_y)]),
    );
}

fn bound_input_count() -> usize {
    return draws()[0]
        .textures
        .iter()
        .take_while(|texture| **texture != 0)
        .count();
}

mod apply_screen_space_fog_effect_to_gl {
    use super::*;
    use crate::assert_close;

    #[test]
    fn puts_the_densest_proxy_fog_at_the_top_of_the_image() {
        // D1 f32 bound (TS: toBeCloseTo(1, 6))
        assert_close(proxy_fog_at_texcoord_y(1.0, 1.0), 1.0, 0.5e-6);
    }

    #[test]
    fn leaves_the_bottom_of_the_image_clear() {
        // D1 f32 bound (TS: toBeCloseTo(0, 6))
        assert_close(proxy_fog_at_texcoord_y(0.0, 1.0), 0.0, 0.5e-6);
    }

    #[test]
    fn thickens_the_proxy_fog_monotonically_from_the_bottom_of_the_image_to_the_top() {
        let values: Vec<f32> = [0.0, 0.25, 0.5, 0.75, 1.0]
            .iter()
            .map(|texcoord_y| proxy_fog_at_texcoord_y(*texcoord_y, 0.8))
            .collect();
        for index in 1..values.len() {
            assert!(values[index] > values[index - 1]);
        }
    }

    #[test]
    fn clamps_the_proxy_fog_at_full_density_rather_than_overshooting() {
        assert_eq!(proxy_fog_at_texcoord_y(1.0, 4.0), 1.0);
    }

    #[test]
    fn binds_the_depth_texture_and_takes_the_depth_branch_when_the_scene_wrote_one() {
        let depth = apply(&fog_effect(), true).unwrap();
        assert_eq!(bound_input_count(), 2);
        assert_eq!(draws()[0].textures[1], depth.0.get() as i32);
        assert_eq!(last_uniform("u_hasDepth"), vec![1.0]);
    }

    #[test]
    fn binds_the_scene_alone_and_takes_the_proxy_branch_when_there_is_no_depth() {
        apply(&fog_effect(), false);
        assert_eq!(bound_input_count(), 1);
        assert_eq!(last_uniform("u_hasDepth"), vec![0.0]);
    }

    #[test]
    fn unpacks_the_fog_color_from_packed_rgba_dropping_the_alpha_the_shader_does_not_take() {
        let effect = fog_effect();
        effect.write().unwrap().color = Some(0x336699ff);
        apply(&effect, false);
        let color = last_uniform("u_fogColor");
        assert_eq!(color.len(), 3);
        // D1 f32 bound (TS: toBeCloseTo(x, 6))
        assert_close(color[0], 0x33 as f32 / 255.0, 0.5e-6);
        assert_close(color[1], 0x66 as f32 / 255.0, 0.5e-6);
        assert_close(color[2], 0x99 as f32 / 255.0, 0.5e-6);
    }

    #[test]
    fn passes_the_depth_window_through_as_descriptor_defaults() {
        apply(&fog_effect(), false);
        assert_eq!(last_uniform("u_density"), vec![1.0]);
        assert_eq!(last_uniform("u_near"), vec![0.0]);
        assert_eq!(last_uniform("u_far"), vec![1.0]);
    }
}

mod gl_screen_space_fog_effect_runner {
    use flight_effects_gl::contract::{GlEffectContext, gl_screen_space_fog_effect_runner};
    use flight_render_gl::create_gl_texture_render_target_pool;

    use super::*;

    #[test]
    fn forwards_the_scene_depth_texture_from_the_runner_context() {
        let mut state = make_state();
        let target = make_texture_target(&state, 8.0, 8.0);
        let depth = flight_render_gl::create_gl_texture(&state).unwrap();
        let mut pool = create_gl_texture_render_target_pool();
        let effect = fog_effect();
        clear_calls();
        let mut context = GlEffectContext {
            state: &mut state,
            source: &target,
            dest: &target,
            pool: &mut pool,
            scene_depth_texture: Some(depth),
            scene_velocity_texture: None,
        };
        gl_screen_space_fog_effect_runner(&mut context, &*effect.read().unwrap()).unwrap();
        assert_eq!(draws()[0].textures[1], depth.0.get() as i32);
        assert_eq!(last_uniform("u_hasDepth"), vec![1.0]);
    }
}

mod register_gl_screen_space_fog_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_screen_space_fog_effect_runner,
        register_gl_screen_space_fog_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn makes_the_runner_resolvable_for_the_screen_space_fog_effect_kind() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "ScreenSpaceFogEffect").is_none());
        register_gl_screen_space_fog_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "ScreenSpaceFogEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_screen_space_fog_effect_runner as GlEffectRunner
        ));
    }
}
