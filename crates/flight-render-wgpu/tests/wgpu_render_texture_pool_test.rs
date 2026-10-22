use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;

use flight_render::RenderTargetDescriptor;
use flight_render_wgpu::*;

use crate::support::*;

fn descriptor(width: f32, height: f32) -> RenderTargetDescriptor {
    return RenderTargetDescriptor {
        width,
        height,
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: None,
        depth: None,
        color_space: None,
    };
}

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .unwrap_or_else(String::new);
}

fn source_extent(texture: &flight_render::RenderTexture) -> (u32, u32) {
    let source = texture.source.as_ref().unwrap().read().unwrap();
    let fields = source.texture_source_fields();
    return (fields.width, fields.height);
}

mod acquire_wgpu_render_texture {
    use super::*;

    #[test]
    fn reuses_a_released_handle_and_reapplies_dimensions_before_the_next_write() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let first = acquire_wgpu_render_texture(&state, &mut pool, &descriptor(32.0, 16.0));
        write_wgpu_render_texture_target(&mut state, &mut first.write().unwrap(), |_, _| {});
        release_wgpu_render_texture(&state, &mut pool, &first);

        assert_eq!(
            explain_wgpu_render_texture(&state, &first.read().unwrap()).status,
            WgpuRenderTextureStatus::Released
        );
        assert!(!is_wgpu_render_texture_ready(
            &mut state,
            &first.read().unwrap()
        ));

        let second = acquire_wgpu_render_texture(&state, &mut pool, &descriptor(80.0, 48.0));
        assert!(Arc::ptr_eq(&second, &first));
        assert_eq!(source_extent(&second.read().unwrap()), (80, 48));
        assert_eq!(
            explain_wgpu_render_texture(&state, &second.read().unwrap()).status,
            WgpuRenderTextureStatus::Unrendered
        );

        write_wgpu_render_texture_target(&mut state, &mut second.write().unwrap(), |_, _| {});
        assert_eq!(
            explain_wgpu_render_texture(&state, &second.read().unwrap()),
            WgpuRenderTextureExplanation {
                height: 48,
                status: WgpuRenderTextureStatus::Ready,
                width: 80,
            }
        );
    }

    #[test]
    fn resets_a_released_slab_view_before_exposing_the_next_logical_target() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let slab_view = acquire_wgpu_render_texture(&state, &mut pool, &descriptor(720.0, 480.0));
        {
            let mut view = slab_view.write().unwrap();
            view.flip_x = true;
            view.flip_y = true;
            view.uv_offset.x = 140.0 / 720.0;
            view.uv_offset.y = 160.0 / 480.0;
            view.uv_rotation = std::f32::consts::PI / 2.0;
            view.uv_scale.x = 100.0 / 720.0;
            view.uv_scale.y = 80.0 / 480.0;
        }
        release_wgpu_render_texture(&state, &mut pool, &slab_view);

        let logical_target =
            acquire_wgpu_render_texture(&state, &mut pool, &descriptor(100.0, 80.0));

        assert!(Arc::ptr_eq(&logical_target, &slab_view));
        let logical = logical_target.read().unwrap();
        assert!(!logical.flip_x);
        assert!(!logical.flip_y);
        assert_eq!((logical.uv_offset.x, logical.uv_offset.y), (0.0, 0.0));
        assert_eq!(logical.uv_rotation, 0.0);
        assert_eq!((logical.uv_scale.x, logical.uv_scale.y), (1.0, 1.0));
    }

    #[test]
    fn does_not_allow_a_pool_to_cross_gpu_devices() {
        let a = create_wgpu_render_state_for_test(None);
        let b = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        acquire_wgpu_render_texture(&a, &mut pool, &descriptor(8.0, 8.0));

        let result = catch_unwind(AssertUnwindSafe(|| {
            acquire_wgpu_render_texture(&b, &mut pool, &descriptor(8.0, 8.0));
        }));
        assert!(panic_message(result.unwrap_err()).contains("cannot cross GPU devices"));
    }
}

mod create_wgpu_render_texture_pool {
    use super::*;

    #[test]
    fn creates_an_empty_device_unbound_pool() {
        let pool = create_wgpu_render_texture_pool();
        assert!(pool.device.is_none());
        assert!(!pool.destroyed);
        assert!(pool.free.is_empty());
        assert!(pool.leased.is_empty());
    }
}

mod destroy_wgpu_render_texture_pool {
    use super::*;

    // The source spies on each hidden target's `texture.destroy`; a destroyed noop texture is
    // observed by its view creation failing validation.
    #[test]
    fn destroys_hidden_targets_for_free_and_outstanding_leases() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let free = acquire_wgpu_render_texture(&state, &mut pool, &descriptor(8.0, 8.0));
        let leased = acquire_wgpu_render_texture(&state, &mut pool, &descriptor(16.0, 16.0));
        write_wgpu_render_texture_target(&mut state, &mut free.write().unwrap(), |_, _| {});
        write_wgpu_render_texture_target(&mut state, &mut leased.write().unwrap(), |_, _| {});
        let free_target =
            get_wgpu_render_texture_target(&mut state, &free.read().unwrap()).unwrap();
        let leased_target =
            get_wgpu_render_texture_target(&mut state, &leased.read().unwrap()).unwrap();
        release_wgpu_render_texture(&state, &mut pool, &free);

        destroy_wgpu_render_texture_pool(&mut state, &mut pool);

        let native = get_wgpu_render_state_native_device(&state);
        assert!(is_wgpu_texture_destroyed(
            &native,
            &free_target.read().unwrap().texture
        ));
        assert!(is_wgpu_texture_destroyed(
            &native,
            &leased_target.read().unwrap().texture
        ));
        assert!(pool.free.is_empty());
        assert!(pool.leased.is_empty());
    }

    #[test]
    fn rejects_acquisition_after_destruction() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        destroy_wgpu_render_texture_pool(&mut state, &mut pool);
        let result = catch_unwind(AssertUnwindSafe(|| {
            acquire_wgpu_render_texture(&state, &mut pool, &descriptor(8.0, 8.0));
        }));
        assert!(panic_message(result.unwrap_err()).contains("has been destroyed"));
    }
}

mod initialize_wgpu_render_texture_pool {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_render_texture_pool() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        acquire_wgpu_render_texture(&state, &mut pool, &descriptor(8.0, 8.0));
        destroy_wgpu_render_texture_pool(&mut state, &mut pool);
        assert!(pool.device.is_some());
        assert!(pool.destroyed);

        initialize_wgpu_render_texture_pool(&mut pool);

        assert!(pool.device.is_none());
        assert!(!pool.destroyed);
        assert!(pool.free.is_empty());
        assert!(pool.leased.is_empty());
        assert!(pool.effect_targets.free.is_empty());
        acquire_wgpu_render_texture(&state, &mut pool, &descriptor(8.0, 8.0));
        assert_eq!(pool.leased.len(), 1);
    }
}

mod release_wgpu_render_texture {
    use super::*;

    #[test]
    fn rejects_a_double_release() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let texture = acquire_wgpu_render_texture(&state, &mut pool, &descriptor(8.0, 8.0));
        release_wgpu_render_texture(&state, &mut pool, &texture);

        let result = catch_unwind(AssertUnwindSafe(|| {
            release_wgpu_render_texture(&state, &mut pool, &texture);
        }));
        assert!(panic_message(result.unwrap_err()).contains("texture is not leased"));
    }
}

mod with_wgpu_render_textures {
    use super::*;

    #[test]
    fn releases_every_lease_when_the_bracket_callback_throws() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_texture_pool();
        let descriptors = [
            descriptor(8.0, 8.0),
            descriptor(8.0, 8.0),
            descriptor(8.0, 8.0),
        ];

        let result = catch_unwind(AssertUnwindSafe(|| {
            with_wgpu_render_textures(&mut state, &mut pool, &descriptors, |_, _, _| {
                panic!("capture failed");
            });
        }));
        assert!(panic_message(result.unwrap_err()).contains("capture failed"));

        assert!(pool.leased.is_empty());
        assert_eq!(pool.free.len(), 3);
    }
}
