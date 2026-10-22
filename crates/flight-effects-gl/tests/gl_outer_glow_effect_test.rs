use flight_render_gl::{GlTextureRenderTarget, create_gl_texture_render_target_pool};

use crate::gl_test_helper::{MockGlDrawState, clear_calls, draws, make_state, make_texture_target};

fn texture_name(target: &GlTextureRenderTarget) -> i32 {
    return target.texture.0.get() as i32;
}

fn framebuffer_name(target: &GlTextureRenderTarget) -> i32 {
    return target.framebuffer.0.get() as i32;
}

/// Draws that read `source` into `dest` (unit 0 only) under the given blend factors.
fn draws_of(
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    blend: (u32, u32),
) -> Vec<MockGlDrawState> {
    return draws()
        .into_iter()
        .filter(|draw| {
            draw.textures[0] == texture_name(source)
                && draw.textures[1] == 0
                && draw.framebuffer == framebuffer_name(dest)
                && (draw.blend_src, draw.blend_dst) == (blend.0 as i32, blend.1 as i32)
        })
        .collect();
}

const BLIT: (u32, u32) = (glow::ONE, glow::ONE_MINUS_SRC_ALPHA);
const ERASE: (u32, u32) = (glow::ZERO, glow::ONE_MINUS_SRC_ALPHA);

fn run_with(
    effect: &flight_effects::OuterGlowEffect,
) -> (GlTextureRenderTarget, GlTextureRenderTarget, usize) {
    let mut state = make_state();
    let source = make_texture_target(&state, 32.0, 16.0);
    let dest = make_texture_target(&state, 32.0, 16.0);
    let mut pool = create_gl_texture_render_target_pool();
    clear_calls();
    flight_effects_gl::contract::apply_outer_glow_effect_to_gl(
        &mut state, &source, &dest, &mut pool, effect,
    )
    .unwrap();
    return (source, dest, pool.free.len());
}

fn with_source_mode(
    mode: flight_effects::EffectSourceMode,
) -> flight_entity::Ref<flight_effects::OuterGlowEffect> {
    let effect = flight_effects::create_outer_glow_effect();
    effect.write().unwrap().source_mode = Some(mode);
    return effect;
}

mod apply_outer_glow_effect_to_gl {
    use flight_effects::{EffectSourceMode, create_outer_glow_effect};

    use super::*;

    #[test]
    fn is_a_function() {
        let (_, _, released) = run_with(&create_outer_glow_effect().read().unwrap());
        assert!(!draws().is_empty());
        assert_eq!(released, 3);
    }

    #[test]
    fn draws_the_source_by_default() {
        let (source, dest, _) = run_with(&create_outer_glow_effect().read().unwrap());
        assert_eq!(draws_of(&source, &dest, BLIT).len(), 1);
        assert!(draws_of(&source, &dest, ERASE).is_empty());
    }

    #[test]
    fn hides_the_source_when_source_mode_is_hide() {
        let (source, dest, _) = run_with(&with_source_mode(EffectSourceMode::Hide).read().unwrap());
        assert!(draws_of(&source, &dest, BLIT).is_empty());
        assert!(draws_of(&source, &dest, ERASE).is_empty());
    }

    #[test]
    fn erases_the_source_silhouette_when_source_mode_is_knockout() {
        let (source, dest, _) =
            run_with(&with_source_mode(EffectSourceMode::Knockout).read().unwrap());
        assert!(draws_of(&source, &dest, BLIT).is_empty());
        assert_eq!(draws_of(&source, &dest, ERASE).len(), 1);
    }
}

mod gl_outer_glow_effect_runner {
    use flight_effects::create_outer_glow_effect;
    use flight_effects_gl::contract::gl_outer_glow_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_outer_glow_effect();
        clear_calls();
        with_effect_context(&mut state, 32.0, 16.0, |ctx| {
            gl_outer_glow_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert!(!draws().is_empty());
    }
}

mod register_gl_outer_glow_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_outer_glow_effect_runner,
        register_gl_outer_glow_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_outer_glow_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "OuterGlowEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_outer_glow_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "OuterGlowEffect").is_none());
    }
}
