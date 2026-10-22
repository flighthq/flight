use std::cell::RefCell;
use std::sync::{Arc, RwLock};

use flight_bitmap::ImageChannel;
use flight_effects::{BitmapDisplacementEffect, create_bitmap_displacement_effect};
use flight_entity::{Ref, allocate_entity};
use flight_render::ExternalTexture;
use flight_render_gl::{GlRenderState, GlTextureRealization, register_gl_texture_resolver};
use flight_texture::{
    Texture2D, TextureColorSpace, TextureSourceRef, TextureVariant, create_texture_2d,
};
use glow::{HasContext, NativeTexture};

const MAP_KIND: &str = "acme.DisplacementMap";

thread_local! {
    static MAP_TEXTURE: RefCell<Option<NativeTexture>> = const { RefCell::new(None) };
    static PREMULTIPLY: RefCell<Vec<bool>> = const { RefCell::new(Vec::new()) };
}

fn resolving_resolver(
    state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    PREMULTIPLY.with(|calls| calls.borrow_mut().push(premultiply));
    let texture = MAP_TEXTURE.with(|map| *map.borrow()).or_else(|| {
        // SAFETY: allocation occurs on the mock context's owning thread.
        let texture = unsafe { state.gl.create_texture() }.ok()?;
        MAP_TEXTURE.with(|map| *map.borrow_mut() = Some(texture));
        Some(texture)
    })?;
    return Some(GlTextureRealization {
        straight_alpha: false,
        texture,
    });
}

fn unresolving_resolver(
    _state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    return None;
}

/// A state whose map texture kind resolves (`resolves`) or yields no texture (the unresolved case).
fn make_map_state(resolves: bool) -> GlRenderState {
    let mut state = crate::gl_test_helper::make_state();
    MAP_TEXTURE.with(|map| *map.borrow_mut() = None);
    PREMULTIPLY.with(|calls| calls.borrow_mut().clear());
    let resolver: flight_render_gl::GlTextureResolver = if resolves {
        resolving_resolver
    } else {
        unresolving_resolver
    };
    register_gl_texture_resolver(&mut state, MAP_KIND.to_string(), Some(resolver));
    return state;
}

fn make_map() -> Ref<Texture2D> {
    let mut source: ExternalTexture = allocate_entity();
    source.kind = MAP_KIND.to_string();
    source.width = 4;
    source.height = 4;
    let source: TextureSourceRef = Arc::new(RwLock::new(source));
    let mut texture = create_texture_2d();
    texture.color_space = TextureColorSpace::Linear;
    texture.source = Some(source);
    return Arc::new(RwLock::new(texture));
}

fn effect(map: Option<Ref<Texture2D>>) -> Ref<BitmapDisplacementEffect> {
    let effect = create_bitmap_displacement_effect();
    effect.write().unwrap().map = map;
    return effect;
}

fn map_texture() -> NativeTexture {
    return MAP_TEXTURE.with(|map| map.borrow().unwrap());
}

mod apply_bitmap_displacement_effect_to_gl {
    use flight_effects::BitmapDisplacementEffectEdgeMode;
    use flight_effects_gl::contract::apply_bitmap_displacement_effect_to_gl;

    use super::*;
    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_texture_target, shader_source_containing,
    };

    #[test]
    fn binds_the_source_and_resolved_map_in_one_fullscreen_pass() {
        let mut state = make_map_state(true);
        let source = make_texture_target(&state, 128.0, 64.0);
        let dest = make_texture_target(&state, 128.0, 64.0);
        clear_calls();
        apply_bitmap_displacement_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &effect(Some(make_map())).read().unwrap(),
        )
        .unwrap();
        assert_eq!(
            PREMULTIPLY.with(|calls| calls.borrow().clone()),
            vec![false]
        );
        let recorded = draws();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].textures[0], source.texture.0.get() as i32);
        assert_eq!(recorded[0].textures[1], map_texture().0.get() as i32);
        assert_eq!(recorded[0].framebuffer, dest.framebuffer.0.get() as i32);
        shader_source_containing("sampleChannel(mapSample, u_componentX)");
    }

    #[test]
    fn maps_selected_channels_and_preserves_signed_scale_uniforms() {
        let mut state = make_map_state(true);
        let source = make_texture_target(&state, 128.0, 64.0);
        let dest = make_texture_target(&state, 128.0, 64.0);
        let effect = effect(Some(make_map()));
        {
            let mut effect = effect.write().unwrap();
            effect.component_x = Some(ImageChannel::Alpha);
            effect.component_y = Some(ImageChannel::Blue);
            effect.scale_x = Some(-14.0);
            effect.scale_y = Some(9.0);
        }
        clear_calls();
        apply_bitmap_displacement_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap())
            .unwrap();
        assert_eq!(
            last_uniform("u_componentX"),
            vec![ImageChannel::Alpha as i32 as f32]
        );
        assert_eq!(
            last_uniform("u_componentY"),
            vec![ImageChannel::Blue as i32 as f32]
        );
        assert_eq!(last_uniform("u_scale"), vec![-14.0, 9.0]);
        assert_eq!(last_uniform("u_resolution"), vec![128.0, 64.0]);
    }

    #[test]
    fn maps_clamp_and_wrap_edge_modes_to_shader_branches_0_and_1() {
        for (edge_mode, expected) in [
            (BitmapDisplacementEffectEdgeMode::Clamp, 0.0),
            (BitmapDisplacementEffectEdgeMode::Wrap, 1.0),
        ] {
            let mut state = make_map_state(true);
            let source = make_texture_target(&state, 128.0, 64.0);
            let dest = make_texture_target(&state, 128.0, 64.0);
            let effect = effect(Some(make_map()));
            effect.write().unwrap().edge_mode = Some(edge_mode);
            clear_calls();
            apply_bitmap_displacement_effect_to_gl(
                &mut state,
                &source,
                &dest,
                &effect.read().unwrap(),
            )
            .unwrap();
            assert_eq!(last_uniform("u_edgeMode"), vec![expected]);
        }
    }

    #[test]
    fn ships_map_channel_centred_offset_wrap_clamp_and_gl_vertical_offset_shader_branches() {
        let mut state = make_map_state(true);
        let source = make_texture_target(&state, 128.0, 64.0);
        let dest = make_texture_target(&state, 128.0, 64.0);
        apply_bitmap_displacement_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &effect(Some(make_map())).read().unwrap(),
        )
        .unwrap();
        let shader = shader_source_containing("u_mapIsRenderTarget");
        assert!(shader.contains("sampleChannel(mapSample, u_componentX)"));
        assert!(shader.contains("sampleChannel(mapSample, u_componentY)"));
        assert!(shader.contains("(mapped - vec2(0.5)) * u_scale"));
        assert!(shader.contains("fract(displaced)"));
        assert!(shader.contains("clamp(displaced, vec2(0.0), vec2(1.0))"));
        assert!(shader.contains("v_texCoord.y - displacement.y"));
    }

    #[test]
    fn copies_through_when_the_map_is_absent_or_unresolved() {
        let mut state = make_map_state(false);
        let source = make_texture_target(&state, 128.0, 64.0);
        let dest = make_texture_target(&state, 128.0, 64.0);
        clear_calls();
        apply_bitmap_displacement_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &effect(Some(make_map())).read().unwrap(),
        )
        .unwrap();
        apply_bitmap_displacement_effect_to_gl(
            &mut state,
            &source,
            &dest,
            &effect(None).read().unwrap(),
        )
        .unwrap();
        let recorded = draws();
        assert_eq!(recorded.len(), 2);
        for draw in recorded {
            assert_eq!(draw.textures[0], source.texture.0.get() as i32);
            assert_eq!(draw.framebuffer, dest.framebuffer.0.get() as i32);
        }
        assert!(crate::gl_test_helper::uniform_values("u_scale").is_empty());
    }
}

mod gl_bitmap_displacement_effect_runner {
    use flight_effects_gl::contract::gl_bitmap_displacement_effect_runner;

    use super::*;
    use crate::gl_test_helper::{clear_calls, last_uniform};
    use crate::with_effect_context;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = make_map_state(true);
        let effect = effect(Some(make_map()));
        {
            let mut effect = effect.write().unwrap();
            effect.scale_x = Some(3.0);
            effect.scale_y = Some(4.0);
        }
        clear_calls();
        with_effect_context(&mut state, 16.0, 16.0, |ctx| {
            gl_bitmap_displacement_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(last_uniform("u_scale"), vec![3.0, 4.0]);
    }
}

mod is_gl_bitmap_displacement_effect_resolvable {
    use flight_effects_gl::contract::is_gl_bitmap_displacement_effect_resolvable;

    use super::*;

    #[test]
    fn exposes_the_missing_map_sentinel() {
        let mut state = make_map_state(true);
        assert!(is_gl_bitmap_displacement_effect_resolvable(
            &mut state,
            &*effect(Some(make_map())).read().unwrap()
        ));
        assert!(!is_gl_bitmap_displacement_effect_resolvable(
            &mut state,
            &*effect(None).read().unwrap()
        ));
        let mut unresolved = make_map_state(false);
        assert!(!is_gl_bitmap_displacement_effect_resolvable(
            &mut unresolved,
            &*effect(Some(make_map())).read().unwrap()
        ));
    }
}

mod register_gl_bitmap_displacement_effect {
    use flight_effects::EffectRef;
    use flight_effects_gl::contract::{
        GlEffectApplicationStatus, GlEffectRunner, explain_gl_effect_application,
        get_gl_effect_runner, gl_bitmap_displacement_effect_runner, is_gl_effect_resolvable,
        register_gl_bitmap_displacement_effect,
    };

    use super::*;
    use crate::gl_test_helper::make_state;

    #[test]
    fn registers_both_the_runner_and_per_instance_map_resolver() {
        let mut state = make_state();
        assert!(get_gl_effect_runner(&state, "BitmapDisplacementEffect").is_none());
        register_gl_bitmap_displacement_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "BitmapDisplacementEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_bitmap_displacement_effect_runner as GlEffectRunner
        ));
        let missing = effect(None);
        assert!(!is_gl_effect_resolvable(
            &mut state,
            &*missing.read().unwrap()
        ));
        let chain: Vec<EffectRef> = vec![missing];
        let explanation = explain_gl_effect_application(&mut state, &chain, true, None);
        assert_eq!(
            explanation.status,
            GlEffectApplicationStatus::UnresolvedEffects
        );
        assert_eq!(explanation.unresolved_indexes, vec![0]);
    }
}
