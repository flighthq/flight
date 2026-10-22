use std::sync::Arc;
use std::sync::RwLock;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_bitmap::contract::{BitmapReadbackBackendReason, BitmapReadbackOutcome};
use flight_bitmap::{BitmapReadbackMode, HostBitmapReadbackCapability, create_bitmap};
use flight_geometry::set_rectangle;
use flight_host::HostImageSource;
use flight_image::{ImageResource, create_image_resolver_state, create_image_resource};
use flight_interaction::hit_tests::{HitTestContext, find_graph_hit_target_precise};
use flight_interaction::node_interaction_state::{
    enable_node_interaction_state, set_node_hit_test_enabled,
};
use flight_interaction::register_sprite_hit_test::register_sprite_hit_test;
use flight_node::NodeRef;
use flight_scene2d::create_sprite;
use flight_texture::{Texture, create_texture_2d};

fn stub_readback() -> Arc<HostBitmapReadbackCapability> {
    return Arc::new(HostBitmapReadbackCapability {
        provider: Arc::new(()),
        read_bitmap: Arc::new(|_source, _w, _h, _mode| BitmapReadbackOutcome {
            bitmap: None,
            reason: BitmapReadbackBackendReason::Ok,
        }),
    });
}

fn sprite_node_with_bounds(x: f32, y: f32, w: f32, h: f32) -> NodeRef {
    let sprite: NodeRef = create_sprite();
    {
        let mut guard = sprite.write().unwrap();
        let bounds = guard
            .as_bounds_node_mut()
            .expect("sprite has bounds")
            .bounds_runtime_mut();
        let rect = bounds
            .local_bounds_rectangle
            .get_or_insert_with(Default::default);
        set_rectangle(rect, x, y, w, h);
        let local_bounds_id = guard.node_runtime().local_bounds_id as i32;
        guard.node_runtime_mut().local_bounds_using_local_bounds_id = local_bounds_id;
    }
    enable_node_interaction_state(&sprite);
    set_node_hit_test_enabled(&sprite, true);
    return sprite;
}

fn make_host_source() -> Arc<HostImageSource> {
    return Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(()),
    });
}

fn make_image_resource(
    host_source: &Arc<HostImageSource>,
    width: u32,
    height: u32,
) -> Arc<RwLock<ImageResource>> {
    let resource = create_image_resource(host_source.clone(), &create_image_resolver_state());
    {
        let mut guard = resource.write().unwrap();
        guard.width = width;
        guard.height = height;
    }
    return resource;
}

fn counting_readback(
    width: u32,
    height: u32,
    alpha: u8,
    call_count: Arc<AtomicUsize>,
) -> Arc<HostBitmapReadbackCapability> {
    return Arc::new(HostBitmapReadbackCapability {
        provider: Arc::new(()),
        read_bitmap: Arc::new(move |_source, w, h, mode| {
            if mode == BitmapReadbackMode::Probe {
                return BitmapReadbackOutcome {
                    bitmap: None,
                    reason: BitmapReadbackBackendReason::Ok,
                };
            }
            call_count.fetch_add(1, Ordering::Relaxed);
            let color: u32 = 0xffffff00 | (alpha as u32);
            let bmp = create_bitmap(w.min(width), h.min(height), Some(color));
            return BitmapReadbackOutcome {
                bitmap: Some(bmp),
                reason: BitmapReadbackBackendReason::Ok,
            };
        }),
    });
}

fn sprite_with_image_texture(
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    image: &Arc<RwLock<ImageResource>>,
) -> NodeRef {
    let sprite = sprite_node_with_bounds(x, y, w, h);
    let mut tex = create_texture_2d();
    tex.source = Some(image.clone());
    let texture_ref = Arc::new(RwLock::new(Texture::Texture2D(tex)));
    {
        let mut guard = sprite.write().unwrap();
        let spr = guard
            .as_any_mut()
            .downcast_mut::<flight_scene2d::Sprite>()
            .unwrap();
        spr.data.texture = Some(texture_ref);
    }
    return sprite;
}

mod register_sprite_hit_test {
    use super::*;

    #[test]
    fn hit_inside_bounds_with_no_texture() {
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, stub_readback(), None);
        let sprite = sprite_node_with_bounds(0.0, 0.0, 100.0, 100.0);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 50.0, 50.0);
        assert!(result.is_some());
    }

    #[test]
    fn miss_outside_bounds_with_no_texture() {
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, stub_readback(), None);
        let sprite = sprite_node_with_bounds(0.0, 0.0, 100.0, 100.0);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 200.0, 200.0);
        assert!(result.is_none());
    }

    #[test]
    fn default_alpha_threshold_is_one() {
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, stub_readback(), None);
        let sprite = sprite_node_with_bounds(0.0, 0.0, 50.0, 50.0);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 25.0, 25.0);
        assert!(result.is_some());
    }

    #[test]
    fn opaque_pixel_hits_with_alpha_readback() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 255, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let source = make_host_source();
        let image = make_image_resource(&source, 10, 10);
        let sprite = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(result.is_some());
        assert_eq!(calls.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn transparent_pixel_misses_with_alpha_readback() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 0, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let source = make_host_source();
        let image = make_image_resource(&source, 10, 10);
        let sprite = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(result.is_none());
    }

    #[test]
    fn cache_success_does_not_re_read_bitmap() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 255, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let source = make_host_source();
        let image = make_image_resource(&source, 10, 10);
        let sprite = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image);
        let _r1 = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        let _r2 = find_graph_hit_target_precise(&ctx, &sprite, 3.0, 3.0);
        assert_eq!(calls.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn different_resources_same_host_source_get_independent_cache_entries() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 255, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let shared_source = make_host_source();
        let image_a = make_image_resource(&shared_source, 10, 10);
        let image_b = make_image_resource(&shared_source, 10, 10);
        let sprite_a = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image_a);
        let sprite_b = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image_b);
        let _r1 = find_graph_hit_target_precise(&ctx, &sprite_a, 5.0, 5.0);
        let _r2 = find_graph_hit_target_precise(&ctx, &sprite_b, 5.0, 5.0);
        assert_eq!(calls.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn readback_failure_retries_on_next_call() {
        let attempt = Arc::new(AtomicUsize::new(0));
        let attempt_inner = attempt.clone();
        let readback = Arc::new(HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(move |_source, w, h, _mode| {
                let n = attempt_inner.fetch_add(1, Ordering::Relaxed);
                if n == 0 {
                    return BitmapReadbackOutcome {
                        bitmap: None,
                        reason: BitmapReadbackBackendReason::Ok,
                    };
                }
                let bmp = create_bitmap(w, h, Some(0xffffffff));
                return BitmapReadbackOutcome {
                    bitmap: Some(bmp),
                    reason: BitmapReadbackBackendReason::Ok,
                };
            }),
        });
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let source = make_host_source();
        let image = make_image_resource(&source, 10, 10);
        let sprite = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image);
        let r1 = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(
            r1.is_some(),
            "readback failure means no alpha data -> falls through to bounds hit"
        );
        let r2 = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(r2.is_some());
        assert_eq!(attempt.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn threshold_at_exact_alpha_value_hits() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 128, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(128));
        let source = make_host_source();
        let image = make_image_resource(&source, 10, 10);
        let sprite = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(result.is_some());
    }

    #[test]
    fn threshold_above_alpha_value_misses() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 127, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(128));
        let source = make_host_source();
        let image = make_image_resource(&source, 10, 10);
        let sprite = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(result.is_none());
    }

    #[test]
    fn different_image_and_readback_sizes_use_image_dimensions_for_uv() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(8, 8, 255, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let source = make_host_source();
        let image = make_image_resource(&source, 20, 20);
        let sprite = sprite_with_image_texture(0.0, 0.0, 20.0, 20.0, &image);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(result.is_some());
    }

    #[test]
    fn negative_pixel_outside_bitmap_bounds_misses() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(5, 5, 255, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let source = make_host_source();
        let image = make_image_resource(&source, 5, 5);
        let sprite = sprite_with_image_texture(0.0, 0.0, 20.0, 20.0, &image);
        let result = find_graph_hit_target_precise(&ctx, &sprite, 15.0, 15.0);
        assert!(result.is_none());
    }

    #[test]
    fn dropped_resource_evicts_cache_entry() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 255, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        {
            let source = make_host_source();
            let image = make_image_resource(&source, 10, 10);
            let sprite = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image);
            let _r1 = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
            assert_eq!(calls.load(Ordering::Relaxed), 1);
        }
        let source2 = make_host_source();
        let image2 = make_image_resource(&source2, 10, 10);
        let sprite2 = sprite_with_image_texture(0.0, 0.0, 10.0, 10.0, &image2);
        let _r2 = find_graph_hit_target_precise(&ctx, &sprite2, 5.0, 5.0);
        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "new resource after drop must re-read bitmap"
        );
    }

    #[test]
    fn resource_dimension_change_uses_current_dimensions() {
        let calls = Arc::new(AtomicUsize::new(0));
        let readback = counting_readback(10, 10, 255, calls.clone());
        let mut ctx = HitTestContext::new();
        register_sprite_hit_test(&mut ctx, readback, Some(1));
        let source = make_host_source();
        let image = make_image_resource(&source, 10, 10);
        let sprite = sprite_with_image_texture(0.0, 0.0, 20.0, 20.0, &image);
        let r1 = find_graph_hit_target_precise(&ctx, &sprite, 5.0, 5.0);
        assert!(r1.is_some());
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        {
            let mut guard = image.write().unwrap();
            guard.width = 20;
            guard.height = 20;
        }
        let r2 = find_graph_hit_target_precise(&ctx, &sprite, 15.0, 15.0);
        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "bitmap cached, no re-read"
        );
        assert!(
            r2.is_none(),
            "point (15,15) with 20x20 image maps to px 15 which is outside 10x10 bitmap"
        );
    }
}
