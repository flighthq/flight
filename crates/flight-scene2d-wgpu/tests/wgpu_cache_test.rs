use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_node::NodeRef;
use flight_render::{
    RENDER_CACHE_KIND, RenderCache, RenderProxies2D, RenderState, Scene3DGraphSyncPolicy,
    copy_all_renderers_from_render_state, copy_render_state_registrations, create_render_cache,
    use_render_cache,
};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;

use crate::support::*;

fn cache() -> Ref<RenderCache> {
    return Arc::new(RwLock::new(create_render_cache()));
}

// TS `createCacheState(screen)`: the screen's backend registries as options, plus the render
// registrations the TS options spread carries (Rust keeps those in the render registries).
fn create_cache_state(
    screen: &mut WgpuRenderState,
    policy: Option<Scene3DGraphSyncPolicy>,
) -> Ref<WgpuRenderState> {
    let registries = get_wgpu_render_state_runtime(screen).registries.clone();
    let options = WgpuRenderStateOptions {
        color_adjustment_feature: registries.color_adjustment_feature,
        color_adjustment_feature_guard: registries.color_adjustment_feature_guard,
        material_renderers: Some((*registries.material_renderers).clone()),
        shape_rasterizer: registries.shape_rasterizer.clone(),
        texture_resolvers: Some((*registries.texture_resolvers).clone()),
        velocity_writers: Some((*registries.velocity_writers).clone()),
        format: Some(screen.format),
        scene_graph_sync_policy: policy,
        ..test_default()
    };
    let device_state = screen.device_state.clone();
    let cache_state = create_wgpu_cache_state(screen, &device_state, Some(&options));
    copy_render_state_registrations(&mut *cache_state.write().unwrap(), &*screen);
    copy_all_renderers_from_render_state(&mut *cache_state.write().unwrap(), &*screen);
    return cache_state;
}

fn proxies() -> RenderProxies2D<WgpuRenderState> {
    return test_default();
}

fn noop_blend(_state: &mut WgpuRenderState, _mode: Option<&flight_materials::BlendMode>) {}

fn other_blend(_state: &mut WgpuRenderState, _mode: Option<&flight_materials::BlendMode>) {}

mod create_wgpu_cache_state {
    use super::*;

    #[test]
    fn does_not_destroy_a_uniform_buffer_owned_by_the_screen_state() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&screen);
        let screen_uniforms = get_wgpu_render_state_runtime(&screen)
            .uniform_buffer
            .clone();
        let cache_state = create_cache_state(&mut screen, None);

        destroy_wgpu_render_state(&mut cache_state.write().unwrap(), &mut proxies());

        assert!(!is_test_buffer_destroyed(&native, &screen_uniforms));
    }

    #[test]
    fn does_not_retain_the_device_tier_when_an_owned_cache_state_is_left_undisposed() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let calls = Arc::new(AtomicU32::new(0));
        let counter = calls.clone();
        register_wgpu_device_teardown(
            &screen,
            Arc::new(move |_device: &WgpuNativeDevice| {
                counter.fetch_add(1, Ordering::SeqCst);
            }),
        );
        let _cache_state = create_cache_state(&mut screen, None);

        destroy_wgpu_render_state(&mut screen, &mut proxies());

        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn resolves_late_screen_blend_mode_wiring_explicitly_until_locally_overridden() {
        let mut screen = create_wgpu_render_state_for_test(None);
        *screen.apply_blend_mode.write().unwrap() = None;
        let cache_state = create_cache_state(&mut screen, None);

        assert!(
            cache_state
                .read()
                .unwrap()
                .apply_blend_mode
                .read()
                .unwrap()
                .is_none()
        );
        assert!(resolve_wgpu_apply_blend_mode(&cache_state.read().unwrap()).is_none());
        *screen.apply_blend_mode.write().unwrap() = Some(noop_blend);
        assert!(
            cache_state
                .read()
                .unwrap()
                .apply_blend_mode
                .read()
                .unwrap()
                .is_none()
        );
        assert!(std::ptr::fn_addr_eq(
            resolve_wgpu_apply_blend_mode(&cache_state.read().unwrap()).unwrap(),
            noop_blend as WgpuApplyBlendMode
        ));

        *cache_state
            .read()
            .unwrap()
            .apply_blend_mode
            .write()
            .unwrap() = Some(other_blend);
        assert!(std::ptr::fn_addr_eq(
            resolve_wgpu_apply_blend_mode(&cache_state.read().unwrap()).unwrap(),
            other_blend as WgpuApplyBlendMode
        ));
    }

    #[test]
    fn copies_renderers_and_shares_the_gpu_device() {
        let mut screen = create_wgpu_render_state_for_test(None);
        enable_wgpu_render_cache(&mut screen);
        register_wgpu_color_adjustment_material_feature(&mut screen);
        let cache_state = create_cache_state(&mut screen, None);
        let cache_state = cache_state.read().unwrap();

        assert!(
            cache_state
                .render_registries()
                .node_renderers
                .entries
                .get(RENDER_CACHE_KIND)
                .is_some_and(|renderer| std::ptr::eq(*renderer, &WGPU_RENDER_CACHE_RENDERER))
        );
        assert!(Arc::ptr_eq(
            &cache_state.device.handle,
            &screen.device.handle
        ));
        assert!(std::ptr::eq(
            get_wgpu_color_adjustment_material_feature(&cache_state).unwrap(),
            get_wgpu_color_adjustment_material_feature(&screen).unwrap()
        ));
        assert!(cache_state.render_registries().color_adjustments.is_some());
    }

    #[test]
    fn shares_persistent_registration_snapshots_and_then_diverges() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let mut first = STANDARD_WGPU_QUAD_MATERIAL_RENDERER.clone();
        first.instance_float_count = 1;
        let mut replacement = STANDARD_WGPU_QUAD_MATERIAL_RENDERER.clone();
        replacement.instance_float_count = 2;
        register_wgpu_quad_material_renderer(&mut screen, "acme.Material".to_string(), first);
        let cache_state = create_cache_state(&mut screen, None);
        let kind = "acme.Material".to_string();
        assert_eq!(
            get_wgpu_quad_material_renderer(&cache_state.read().unwrap(), &kind)
                .unwrap()
                .instance_float_count,
            1
        );

        register_wgpu_quad_material_renderer(&mut screen, kind.clone(), replacement);

        assert_eq!(
            get_wgpu_quad_material_renderer(&screen, &kind)
                .unwrap()
                .instance_float_count,
            2
        );
        assert_eq!(
            get_wgpu_quad_material_renderer(&cache_state.read().unwrap(), &kind)
                .unwrap()
                .instance_float_count,
            1
        );
    }
}

mod enable_wgpu_render_cache {
    use super::*;

    #[test]
    fn registers_the_renderer_for_the_render_cache_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        enable_wgpu_render_cache(&mut state);
        assert!(
            state
                .render_registries()
                .node_renderers
                .entries
                .get(RENDER_CACHE_KIND)
                .is_some_and(|renderer| std::ptr::eq(*renderer, &WGPU_RENDER_CACHE_RENDERER))
        );
    }
}

mod ensure_wgpu_render_cache_target {
    use super::*;

    #[test]
    fn creates_a_target_sized_to_the_request() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target =
            ensure_wgpu_render_cache_target(&mut state, &create_render_cache(), 64.0, 32.0);
        let target = target.read().unwrap();
        assert_eq!((target.width, target.height), (64, 32));
    }

    #[test]
    fn reuses_and_resizes_the_same_target_on_subsequent_calls() {
        let mut state = create_wgpu_render_state_for_test(None);
        let cache = create_render_cache();
        let first = ensure_wgpu_render_cache_target(&mut state, &cache, 64.0, 32.0);
        let second = ensure_wgpu_render_cache_target(&mut state, &cache, 16.0, 16.0);
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(second.read().unwrap().width, 16);
    }

    #[test]
    fn keeps_targets_isolated_per_state_for_the_same_handle() {
        let mut state_a = create_wgpu_render_state_for_test(None);
        let mut state_b = create_wgpu_render_state_for_test(None);
        let cache = create_render_cache();
        let a = ensure_wgpu_render_cache_target(&mut state_a, &cache, 8.0, 8.0);
        let b = ensure_wgpu_render_cache_target(&mut state_b, &cache, 8.0, 8.0);
        assert!(!Arc::ptr_eq(&a, &b));
    }

    #[test]
    fn enumerates_and_destroys_every_owned_target_during_state_teardown() {
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let first_cache = create_render_cache();
        let second_cache = create_render_cache();
        let first = ensure_wgpu_render_cache_target(&mut state, &first_cache, 8.0, 8.0);
        let second = ensure_wgpu_render_cache_target(&mut state, &second_cache, 16.0, 16.0);

        destroy_wgpu_render_state(&mut state, &mut proxies());

        assert!(is_test_texture_destroyed(
            &native,
            &first.read().unwrap().texture
        ));
        assert!(is_test_texture_destroyed(
            &native,
            &second.read().unwrap().texture
        ));
        assert!(get_wgpu_render_cache_target(&state, &first_cache).is_none());
        assert!(get_wgpu_render_cache_target(&state, &second_cache).is_none());
    }
}

mod get_wgpu_render_cache_target {
    use super::*;

    #[test]
    fn returns_none_before_a_target_is_allocated() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_render_cache_target(&state, &create_render_cache()).is_none());
    }

    #[test]
    fn returns_the_allocated_target() {
        let mut state = create_wgpu_render_state_for_test(None);
        let cache = create_render_cache();
        let target = ensure_wgpu_render_cache_target(&mut state, &cache, 8.0, 8.0);
        assert!(Arc::ptr_eq(
            &get_wgpu_render_cache_target(&state, &cache).unwrap(),
            &target
        ));
    }
}

mod refresh_wgpu_render_cache {
    use super::*;

    fn submits(records: &std::sync::Arc<std::sync::Mutex<Vec<WgpuCommandRecord>>>) -> usize {
        return records
            .lock()
            .unwrap()
            .iter()
            .filter(|record| matches!(record, WgpuCommandRecord::Submit(_)))
            .count();
    }

    #[test]
    fn opens_and_submits_a_standalone_frame_when_called_outside_the_visible_frame() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&screen));
        let cache_state = create_cache_state(&mut screen, None);
        let obj: NodeRef = flight_scene2d::create_display_object();
        refresh_wgpu_render_cache(
            &mut screen,
            &mut cache_state.write().unwrap(),
            &mut proxies(),
            &cache(),
            &obj,
            Some(&flight_render::RenderCacheRefreshOptions {
                padding: Some(5.0),
                min_width: None,
                min_height: None,
            }),
        );
        assert_eq!(submits(&records), 1);
        assert!(
            get_wgpu_render_state_runtime(&screen)
                .command_encoder
                .is_none()
        );
    }

    #[test]
    fn records_into_an_active_application_frame_without_submitting_it() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let cache_state = create_cache_state(&mut screen, None);
        open_test_screen_pass(&mut screen);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&screen));
        let obj: NodeRef = flight_scene2d::create_display_object();
        refresh_wgpu_render_cache(
            &mut screen,
            &mut cache_state.write().unwrap(),
            &mut proxies(),
            &cache(),
            &obj,
            Some(&flight_render::RenderCacheRefreshOptions {
                padding: Some(5.0),
                min_width: None,
                min_height: None,
            }),
        );
        assert_eq!(submits(&records), 0);
        assert!(
            get_wgpu_render_state_runtime(&screen)
                .command_encoder
                .is_some()
        );
        submit_wgpu_frame(&mut screen);
    }

    #[test]
    fn bakes_on_the_first_call_and_allocates_the_target_on_the_screen_state() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let cache_state = create_cache_state(&mut screen, None);
        let cache = cache();
        let obj: NodeRef = flight_scene2d::create_display_object();
        let rebaked = refresh_wgpu_render_cache(
            &mut screen,
            &mut cache_state.write().unwrap(),
            &mut proxies(),
            &cache,
            &obj,
            Some(&flight_render::RenderCacheRefreshOptions {
                padding: Some(5.0),
                min_width: None,
                min_height: None,
            }),
        );
        assert!(rebaked);
        let target = get_wgpu_render_cache_target(&screen, &cache.read().unwrap()).unwrap();
        assert_eq!(target.read().unwrap().width, 10);
    }

    #[test]
    fn skips_the_bake_under_requires_invalidation_when_nothing_changed() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let cache_state = create_cache_state(
            &mut screen,
            Some(Scene3DGraphSyncPolicy::RequiresInvalidation),
        );
        let cache = cache();
        let obj: NodeRef = flight_scene2d::create_display_object();
        let mut cache_proxies = proxies();
        let options = flight_render::RenderCacheRefreshOptions {
            padding: Some(5.0),
            min_width: None,
            min_height: None,
        };
        refresh_wgpu_render_cache(
            &mut screen,
            &mut cache_state.write().unwrap(),
            &mut cache_proxies,
            &cache,
            &obj,
            Some(&options),
        );
        assert!(!refresh_wgpu_render_cache(
            &mut screen,
            &mut cache_state.write().unwrap(),
            &mut cache_proxies,
            &cache,
            &obj,
            Some(&options),
        ));
    }
}

mod release_wgpu_render_cache {
    use super::*;

    #[test]
    fn destroys_and_drops_the_target_for_the_cache() {
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let cache = create_render_cache();
        let target = ensure_wgpu_render_cache_target(&mut state, &cache, 8.0, 8.0);
        release_wgpu_render_cache(&mut state, &cache);
        assert!(is_test_texture_destroyed(
            &native,
            &target.read().unwrap().texture
        ));
        assert!(get_wgpu_render_cache_target(&state, &cache).is_none());
    }
}

mod wgpu_render_cache_renderer {
    use super::*;

    #[test]
    fn does_nothing_when_no_cache_is_attached_to_the_source() {
        let mut state = create_test_state_in_pass();
        let obj: NodeRef = flight_scene2d::create_display_object();
        let proxy = create_test_proxy_for(&mut state, &obj);
        let before = get_wgpu_render_state_runtime(&state).uniform_offset;
        (WGPU_RENDER_CACHE_RENDERER.submit)(&mut state, &proxy);
        assert_eq!(get_wgpu_render_state_runtime(&state).uniform_offset, before);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn composites_the_cache_target_attached_to_the_source_node() {
        let mut state = create_test_state_in_pass();
        let obj: NodeRef = flight_scene2d::create_display_object();
        let cache = cache();
        use_render_cache(&mut state, &obj, cache.clone());
        ensure_wgpu_render_cache_target(&mut state, &cache.read().unwrap(), 16.0, 16.0);
        let proxy = create_test_proxy_for(&mut state, &obj);
        let before = get_wgpu_render_state_runtime(&state).uniform_offset;
        (WGPU_RENDER_CACHE_RENDERER.submit)(&mut state, &proxy);
        assert!(get_wgpu_render_state_runtime(&state).uniform_offset > before);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn flushes_pending_batched_geometry_before_the_immediate_composite() {
        let mut state = create_test_state_in_pass();
        reset_wgpu_render_stats(&mut state);
        let obj: NodeRef = flight_scene2d::create_display_object();
        let cache = cache();
        use_render_cache(&mut state, &obj, cache.clone());
        ensure_wgpu_render_cache_target(&mut state, &cache.read().unwrap(), 16.0, 16.0);
        let tex = create_test_texture_entry(&state);
        prepare_wgpu_quad_batch_write(
            &mut state,
            &tex,
            None,
            None,
            None,
            &STANDARD_WGPU_QUAD_MATERIAL_RENDERER,
            1,
            None,
        );
        get_wgpu_render_state_runtime_mut(&mut state).quad_batch_writer_count = 1;
        let proxy = create_test_proxy_for(&mut state, &obj);

        (WGPU_RENDER_CACHE_RENDERER.submit)(&mut state, &proxy);

        assert_eq!(
            get_wgpu_render_state_runtime(&state).quad_batch_writer_count,
            0
        );
        assert_eq!(get_wgpu_render_stats(&mut state).batch_flush_count, 1);
        submit_wgpu_frame(&mut state);
    }
}
