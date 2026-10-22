use std::sync::Arc;

use flight_render_wgpu::*;
use flight_texture::RenderTargetColorSpace;

use crate::support::*;

fn descriptor(width: f32, height: f32) -> WgpuTextureRenderTargetDescriptor {
    return WgpuTextureRenderTargetDescriptor {
        height,
        width,
        ..test_default()
    };
}

mod acquire_wgpu_texture_render_target {
    use super::*;

    #[test]
    fn reuses_a_released_target_matching_width_height_and_format() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_target_pool();
        let first = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(64.0, 64.0));
        release_wgpu_texture_render_target(&mut pool, first.clone());
        let second = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(64.0, 64.0));
        assert!(Arc::ptr_eq(&second, &first));
    }

    #[test]
    fn allocates_a_distinct_target_when_no_free_target_matches_the_format() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_target_pool();
        let eight = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(64.0, 64.0));
        release_wgpu_texture_render_target(&mut pool, eight.clone());
        let hdr = acquire_wgpu_texture_render_target(
            &state,
            &mut pool,
            &WgpuTextureRenderTargetDescriptor {
                format: Some(wgpu::TextureFormat::Rgba16Float),
                ..descriptor(64.0, 64.0)
            },
        );
        assert!(!Arc::ptr_eq(&hdr, &eight));
        assert_eq!(hdr.read().unwrap().format, wgpu::TextureFormat::Rgba16Float);
    }

    #[test]
    fn realizes_and_pools_a_four_sample_request_at_twice_the_extent_in_each_axis() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_target_pool();
        let four_sample = WgpuTextureRenderTargetDescriptor {
            sample_count: Some(4),
            ..descriptor(64.0, 48.0)
        };
        let supersampled = acquire_wgpu_texture_render_target(&state, &mut pool, &four_sample);
        {
            let target = supersampled.read().unwrap();
            assert_eq!(target.width, 128);
            assert_eq!(target.height, 96);
            assert_eq!(target.sample_count, 4);
        }

        release_wgpu_texture_render_target(&mut pool, supersampled.clone());
        let single_sampled =
            acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(128.0, 96.0));
        assert!(!Arc::ptr_eq(&single_sampled, &supersampled));

        let reused = acquire_wgpu_texture_render_target(&state, &mut pool, &four_sample);
        assert!(Arc::ptr_eq(&reused, &supersampled));
    }

    #[test]
    fn re_stamps_the_logical_color_space_when_reusing_storage() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_target_pool();
        let first = acquire_wgpu_texture_render_target(
            &state,
            &mut pool,
            &WgpuTextureRenderTargetDescriptor {
                color_space: Some(RenderTargetColorSpace::Linear),
                ..descriptor(64.0, 64.0)
            },
        );
        assert_eq!(
            first.read().unwrap().color_space,
            RenderTargetColorSpace::Linear
        );
        release_wgpu_texture_render_target(&mut pool, first.clone());
        let reused = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(64.0, 64.0));
        assert!(Arc::ptr_eq(&reused, &first));
        assert_eq!(
            reused.read().unwrap().color_space,
            RenderTargetColorSpace::Srgb
        );
    }
}

mod create_wgpu_render_target_pool {
    use super::*;

    #[test]
    fn starts_with_an_empty_free_list() {
        assert!(create_wgpu_render_target_pool().free.is_empty());
    }
}

mod destroy_wgpu_render_target_pool {
    use super::*;

    #[test]
    fn clears_the_free_list() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_target_pool();
        let target = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(32.0, 32.0));
        release_wgpu_texture_render_target(&mut pool, target.clone());
        destroy_wgpu_render_target_pool(&mut pool);
        assert!(pool.free.is_empty());
        let native = get_wgpu_render_state_native_device(&state);
        assert!(is_wgpu_texture_destroyed(
            &native,
            &target.read().unwrap().texture
        ));
    }
}

mod initialize_wgpu_render_target_pool {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_render_target_pool() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_target_pool();
        let target = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(16.0, 16.0));
        release_wgpu_texture_render_target(&mut pool, target.clone());
        assert_eq!(pool.free.len(), 1);

        initialize_wgpu_render_target_pool(&mut pool);

        assert!(pool.free.is_empty());
        let fresh = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(16.0, 16.0));
        assert!(!Arc::ptr_eq(&fresh, &target));
    }
}

mod release_wgpu_texture_render_target {
    use super::*;

    #[test]
    fn returns_the_target_to_the_free_list() {
        let state = create_wgpu_render_state_for_test(None);
        let mut pool = create_wgpu_render_target_pool();
        let target = acquire_wgpu_texture_render_target(&state, &mut pool, &descriptor(16.0, 16.0));
        release_wgpu_texture_render_target(&mut pool, target.clone());
        assert!(pool.free.iter().any(|free| Arc::ptr_eq(free, &target)));
    }
}
