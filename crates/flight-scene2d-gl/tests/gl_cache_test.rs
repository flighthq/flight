use std::cell::Cell;
use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, get_entity_id};
use flight_node::NodeRef;
use flight_render::{
    RENDER_CACHE_KIND, RenderCache, Scene3DGraphSyncPolicy, create_render_cache, use_render_cache,
};
use flight_render_gl::{
    GlRenderState, GlRenderStateOptions, begin_gl_render_pass, create_gl_screen_render_target,
    destroy_gl_render_state, end_gl_render_pass,
};
use flight_scene2d_gl::contract::*;

use crate::gl_test_helper::{
    call_names, calls_with, create_gl_state, display_node, make_proxies, make_scene2d_proxy,
    test_default,
};

fn fake_screen() -> GlRenderState {
    return create_gl_state();
}

fn cache_ref() -> Ref<RenderCache> {
    return Arc::new(RwLock::new(create_render_cache()));
}

fn registries_options(state: &GlRenderState) -> GlRenderStateOptions {
    let mut options = test_default::<GlRenderStateOptions>();
    options.render_registries.node_renderers = Some((*state.registries.node_renderers).clone());
    options.render_registries.render_root_guard = None;
    return options;
}

fn is_cache_renderer(state: &GlRenderState) -> bool {
    return state
        .registries
        .node_renderers
        .entries
        .get(RENDER_CACHE_KIND)
        .is_some_and(|renderer| std::ptr::eq(*renderer, &GL_RENDER_CACHE_RENDERER));
}

fn submit_cache(state: &mut GlRenderState, source: NodeRef) {
    let mut proxy = make_scene2d_proxy(state, source);
    proxy.kind = RENDER_CACHE_KIND.to_string();
    let screen = create_gl_screen_render_target(Rc::clone(&state.gl), 200, 100);
    let pass = begin_gl_render_pass(state, &screen, None, None).unwrap();
    (GL_RENDER_CACHE_RENDERER.submit)(state, &proxy);
    end_gl_render_pass(state, &pass).unwrap();
}

mod create_gl_cache_state {
    use super::*;

    #[test]
    fn copies_renderers_and_shares_the_gl_context_but_keeps_its_own_node_map() {
        let mut screen = fake_screen();
        enable_gl_render_cache(&mut screen);
        let cache_state = create_gl_cache_state(&screen, Some(&registries_options(&screen)));
        assert!(is_cache_renderer(&cache_state));
        assert!(Rc::ptr_eq(&cache_state.gl, &screen.gl));
        assert!(!Rc::ptr_eq(&cache_state.gl_runtime, &screen.gl_runtime));
    }

    // Native deviation: the cache state is a caller-owned value, so the caller destroys it; the
    // context tier is released once the last state over it is destroyed.
    #[test]
    fn does_not_retain_the_context_tier_when_an_owned_cache_state_is_left_undisposed() {
        let mut screen = fake_screen();
        let called = Rc::new(Cell::new(0));
        let observed = Rc::clone(&called);
        screen
            .context_state
            .runtime_state
            .borrow_mut()
            .teardowns
            .push(Box::new(move |_| observed.set(observed.get() + 1)));

        let mut cache_state = create_gl_cache_state(&screen, None);
        destroy_gl_render_state(&mut cache_state, &mut make_proxies());
        destroy_gl_render_state(&mut screen, &mut make_proxies());

        assert_eq!(called.get(), 1);
    }
}

mod enable_gl_render_cache {
    use super::*;

    #[test]
    fn registers_the_renderer_for_the_render_cache_kind() {
        let mut state = fake_screen();
        enable_gl_render_cache(&mut state);
        assert!(is_cache_renderer(&state));
    }
}

mod ensure_gl_render_cache_target {
    use super::*;

    #[test]
    fn creates_a_target_sized_to_the_request() {
        let state = fake_screen();
        let target = ensure_gl_render_cache_target(&state, &create_render_cache(), 64.0, 32.0);
        assert_eq!(target.borrow().axes.width, 64);
        assert_eq!(target.borrow().axes.height, 32);
    }

    #[test]
    fn reuses_and_resizes_the_same_target_on_subsequent_calls() {
        let state = fake_screen();
        let cache = create_render_cache();
        let first = ensure_gl_render_cache_target(&state, &cache, 64.0, 32.0);
        let second = ensure_gl_render_cache_target(&state, &cache, 16.0, 16.0);
        assert!(Rc::ptr_eq(&second, &first));
        assert_eq!(second.borrow().axes.width, 16);
    }

    #[test]
    fn keeps_targets_isolated_per_state_for_the_same_handle() {
        let state_a = fake_screen();
        let state_b = fake_screen();
        let cache = create_render_cache();
        let a = ensure_gl_render_cache_target(&state_a, &cache, 8.0, 8.0);
        let b = ensure_gl_render_cache_target(&state_b, &cache, 8.0, 8.0);
        assert!(!Rc::ptr_eq(&a, &b));
    }
}

mod get_gl_render_cache_target {
    use super::*;

    #[test]
    fn returns_null_before_a_target_is_allocated() {
        assert!(get_gl_render_cache_target(&fake_screen(), &create_render_cache()).is_none());
    }

    #[test]
    fn returns_the_allocated_target() {
        let state = fake_screen();
        let cache = create_render_cache();
        let target = ensure_gl_render_cache_target(&state, &cache, 8.0, 8.0);
        assert!(Rc::ptr_eq(
            &get_gl_render_cache_target(&state, &cache).unwrap(),
            &target
        ));
    }
}

mod gl_render_cache_renderer {
    use super::*;

    #[test]
    fn does_nothing_when_no_cache_is_attached_to_the_source() {
        let mut state = fake_screen();
        let before = calls_with("draw_elements").len();
        submit_cache(&mut state, display_node());
        assert_eq!(calls_with("draw_elements").len(), before);
    }

    #[test]
    fn composites_the_cache_target_attached_to_the_source_node() {
        let mut state = fake_screen();
        let object = display_node();
        let cache = cache_ref();
        use_render_cache(&mut state, &object, cache.clone());
        let target = ensure_gl_render_cache_target(&state, &cache.read().unwrap(), 16.0, 16.0);
        let texture = i64::from(target.borrow().texture.0.get());

        submit_cache(&mut state, object);

        assert!(
            calls_with("bind_texture")
                .iter()
                .any(|call| call.integers == vec![i64::from(glow::TEXTURE_2D), texture])
        );
        assert_eq!(calls_with("draw_elements").len(), 1);
    }

    #[test]
    fn flushes_pending_batched_geometry_before_the_immediate_composite() {
        let mut state = fake_screen();
        let object = display_node();
        let cache = cache_ref();
        use_render_cache(&mut state, &object, cache.clone());
        ensure_gl_render_cache_target(&state, &cache.read().unwrap(), 16.0, 16.0);
        let texture = flight_render_gl::create_gl_texture(&state).unwrap();
        prepare_gl_quad_batch_write(
            &mut state,
            texture,
            false,
            None,
            None,
            None,
            &STANDARD_GL_QUAD_MATERIAL_RENDERER,
            1,
            None,
        );
        state.gl_runtime.borrow_mut().quad_batch_writer_count = 1;

        submit_cache(&mut state, object);

        let names = call_names();
        let flushed = names
            .iter()
            .position(|name| name == "draw_elements_instanced");
        let composited = names.iter().position(|name| name == "draw_elements");
        assert!(flushed.is_some() && composited.is_some());
        assert!(flushed < composited);
    }
}

mod refresh_gl_render_cache {
    use super::*;

    #[test]
    fn bakes_on_the_first_call_and_allocates_the_target_on_the_screen_state() {
        let screen = fake_screen();
        let mut cache_state = create_gl_cache_state(&screen, Some(&registries_options(&screen)));
        let mut cache_proxies = make_proxies();
        let cache = cache_ref();
        let object = display_node();
        let options = RenderCacheRefreshOptions {
            padding: Some(5.0),
            min_width: None,
            min_height: None,
        };

        let rebaked = refresh_gl_render_cache(
            &screen,
            &mut cache_state,
            &mut cache_proxies,
            &cache,
            &object,
            Some(&options),
        );

        assert!(rebaked);
        assert!(
            calls_with("clear")
                .iter()
                .any(|call| call.integers == vec![i64::from(glow::COLOR_BUFFER_BIT)])
        );
        let target = get_gl_render_cache_target(&screen, &cache.read().unwrap()).unwrap();
        assert_eq!(target.borrow().axes.width, 10);
    }

    #[test]
    fn skips_the_bake_under_requires_invalidation_when_nothing_changed() {
        let mut screen = fake_screen();
        screen.render.scene_graph_sync_policy = Scene3DGraphSyncPolicy::RequiresInvalidation;
        let mut cache_state = create_gl_cache_state(&screen, Some(&registries_options(&screen)));
        cache_state.render.scene_graph_sync_policy = Scene3DGraphSyncPolicy::RequiresInvalidation;
        let mut cache_proxies = make_proxies();
        let cache = cache_ref();
        let object = display_node();
        let options = RenderCacheRefreshOptions {
            padding: Some(5.0),
            min_width: None,
            min_height: None,
        };
        refresh_gl_render_cache(
            &screen,
            &mut cache_state,
            &mut cache_proxies,
            &cache,
            &object,
            Some(&options),
        );
        assert!(!refresh_gl_render_cache(
            &screen,
            &mut cache_state,
            &mut cache_proxies,
            &cache,
            &object,
            Some(&options),
        ));
    }
}

mod release_gl_render_cache {
    use super::*;

    #[test]
    fn destroys_and_drops_the_target_for_the_cache() {
        let state = fake_screen();
        let cache = create_render_cache();
        let target = ensure_gl_render_cache_target(&state, &cache, 8.0, 8.0);
        release_gl_render_cache(&state, &cache);
        assert!(target.borrow().destroyed);
        assert!(get_gl_render_cache_target(&state, &cache).is_none());
    }

    #[test]
    fn destroys_every_enumerated_target_when_the_owning_state_is_destroyed() {
        let mut state = fake_screen();
        let first = ensure_gl_render_cache_target(&state, &create_render_cache(), 8.0, 8.0);
        let second = ensure_gl_render_cache_target(&state, &create_render_cache(), 16.0, 16.0);
        assert_ne!(
            get_entity_id(&*first.borrow()),
            get_entity_id(&*second.borrow())
        );

        destroy_gl_render_state(&mut state, &mut make_proxies());

        assert!(first.borrow().destroyed);
        assert!(second.borrow().destroyed);
    }
}
