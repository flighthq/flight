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

fn run_with(
    effect: &flight_effects::InnerShadowEffect,
) -> (GlTextureRenderTarget, GlTextureRenderTarget) {
    let mut state = make_state();
    let source = make_texture_target(&state, 32.0, 16.0);
    let dest = make_texture_target(&state, 32.0, 16.0);
    let mut pool = create_gl_texture_render_target_pool();
    clear_calls();
    flight_effects_gl::contract::apply_inner_shadow_effect_to_gl(
        &mut state, &source, &dest, &mut pool, effect,
    )
    .unwrap();
    assert_eq!(pool.free.len(), 3);
    return (source, dest);
}

/// Every blit composited into `dest` (unit 0 only, premultiplied blending), in draw order.
fn composites_into(dest: &GlTextureRenderTarget) -> Vec<MockGlDrawState> {
    return draws()
        .into_iter()
        .filter(|draw| {
            draw.framebuffer == framebuffer_name(dest)
                && draw.textures[1] == 0
                && (draw.blend_src, draw.blend_dst) == (BLIT.0 as i32, BLIT.1 as i32)
        })
        .collect();
}

fn hidden() -> flight_entity::Ref<flight_effects::InnerShadowEffect> {
    let effect = flight_effects::create_inner_shadow_effect();
    effect.write().unwrap().source_mode = Some(flight_effects::InnerEffectSourceMode::Hide);
    return effect;
}

mod apply_inner_shadow_effect_to_gl {
    use flight_effects::create_inner_shadow_effect;

    use super::*;
    use crate::gl_test_helper::uniform_values;

    #[test]
    fn is_a_function() {
        run_with(&create_inner_shadow_effect().read().unwrap());
        assert!(!draws().is_empty());
    }

    #[test]
    fn composites_the_source_before_the_clipped_shadow_by_default() {
        let (source, dest) = run_with(&create_inner_shadow_effect().read().unwrap());
        let composites = composites_into(&dest);
        assert_eq!(composites.len(), 2);
        assert_eq!(composites[0].textures[0], texture_name(&source));
    }

    #[test]
    fn omits_the_source_composite_when_source_mode_is_hide() {
        let (source, dest) = run_with(&hidden().read().unwrap());
        let composites = composites_into(&dest);
        assert_eq!(composites.len(), 1);
        assert!(draws_of(&source, &dest, BLIT).is_empty());
        assert_ne!(composites[0].textures[0], texture_name(&source));
    }

    #[test]
    fn uses_an_inverted_exterior_edge_color_for_hidden_source_blur() {
        let effect = hidden();
        {
            let mut effect = effect.write().unwrap();
            effect.color = Some(0x000000ff);
        }
        run_with(&effect.read().unwrap());
        assert!(uniform_values("u_edgeColor").contains(&vec![0.0, 0.0, 0.0, 1.0]));
    }

    #[test]
    fn preserves_the_clipped_shadow_pass_when_source_mode_is_hide() {
        let (source, _) = run_with(&hidden().read().unwrap());
        let clips: Vec<MockGlDrawState> = draws()
            .into_iter()
            .filter(|draw| draw.textures[1] == texture_name(&source))
            .collect();
        assert_eq!(clips.len(), 1);
        assert_ne!(clips[0].textures[0], 0);
        assert_eq!(
            (clips[0].blend_src, clips[0].blend_dst),
            (glow::ONE as i32, glow::ZERO as i32)
        );
    }
}

mod gl_inner_shadow_effect_runner {
    use flight_effects::create_inner_shadow_effect;
    use flight_effects_gl::contract::gl_inner_shadow_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_inner_shadow_effect();
        clear_calls();
        with_effect_context(&mut state, 32.0, 16.0, |ctx| {
            gl_inner_shadow_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert!(!draws().is_empty());
    }
}

mod register_gl_inner_shadow_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_inner_shadow_effect_runner,
        register_gl_inner_shadow_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        let other = make_state();
        register_gl_inner_shadow_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "InnerShadowEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_inner_shadow_effect_runner as GlEffectRunner
        ));
        assert!(get_gl_effect_runner(&other, "InnerShadowEffect").is_none());
    }
}
