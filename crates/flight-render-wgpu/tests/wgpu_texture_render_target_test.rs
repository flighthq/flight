use flight_geometry::create_matrix;
use flight_render_wgpu::*;
use flight_texture::RenderTargetColorSpace;

use crate::support::*;

// The source's `resolveWgpuSmoothingBindGroup(state, target, true)` memoizes onto the target's own
// binding cache; Rust's resolver takes a texture entry, so the same linear-sampler bind group is
// built over the target's view and memoized on the target here.
fn resolve_linear_bind_group(
    state: &WgpuRenderState,
    target: &mut WgpuTextureRenderTarget,
) -> (wgpu::Sampler, wgpu::BindGroup) {
    let resources = get_wgpu_render_state_device_resources(state);
    let sampler = resources.linear_sampler.clone();
    if let Some(cached) = target.bindings.get(&sampler) {
        return (sampler, cached.clone());
    }
    let bind_group = get_wgpu_render_state_native_device(state)
        .device
        .create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &resources.texture_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&target.view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
    target.bindings.insert(sampler.clone(), bind_group.clone());
    return (sampler, bind_group);
}

mod create_wgpu_texture_render_target {
    use super::*;

    #[test]
    fn returns_a_target_with_texture_view_binding_cache_and_depth_stencil() {
        let state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_texture_render_target(&state, 256.0, 256.0, None, None, None);
        assert_eq!(target.texture.width(), 256);
        assert!(target.bindings.is_empty());
        assert_eq!(
            target.depth_stencil_texture.format(),
            wgpu::TextureFormat::Depth24PlusStencil8
        );
        assert_eq!(target.depth_stencil_texture.width(), 256);
        let native = get_wgpu_render_state_native_device(&state);
        assert!(!is_wgpu_texture_destroyed(&native, &target.texture));
        assert_eq!(target.width, 256);
        assert_eq!(target.height, 256);
    }

    #[test]
    fn clamps_to_minimum_1x1() {
        let state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_texture_render_target(&state, 0.0, 0.0, None, None, None);
        assert_eq!(target.width, 1);
        assert_eq!(target.height, 1);
    }

    #[test]
    fn defaults_to_srgb_and_accepts_a_linear_content_declaration() {
        let state = create_wgpu_render_state_for_test(None);
        assert_eq!(
            create_wgpu_texture_render_target(&state, 16.0, 16.0, None, None, None).color_space,
            RenderTargetColorSpace::Srgb
        );
        assert_eq!(
            create_wgpu_texture_render_target(
                &state,
                16.0,
                16.0,
                Some(state.format),
                Some(RenderTargetColorSpace::Linear),
                None
            )
            .color_space,
            RenderTargetColorSpace::Linear
        );
    }

    #[test]
    fn realizes_four_coverage_samples_as_a_2x_extent_in_each_axis() {
        let state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_texture_render_target(
            &state,
            64.0,
            48.0,
            Some(state.format),
            Some(RenderTargetColorSpace::Srgb),
            Some(4),
        );
        assert_eq!(target.width, 128);
        assert_eq!(target.height, 96);
        assert_eq!(target.sample_count, 4);
        assert_eq!(target.texture.width(), 128);
        assert_eq!(target.texture.height(), 96);
    }
}

mod destroy_wgpu_texture_render_target {
    use super::*;

    // The source spies on both textures' `destroy`; a destroyed noop texture is observed by its
    // view creation failing validation.
    #[test]
    fn calls_destroy_on_texture_and_depth_stencil() {
        let state = create_wgpu_render_state_for_test(None);
        let target = create_wgpu_texture_render_target(&state, 64.0, 64.0, None, None, None);
        let native = get_wgpu_render_state_native_device(&state);
        destroy_wgpu_texture_render_target(&target);
        assert!(is_wgpu_texture_destroyed(&native, &target.texture));
        assert!(is_wgpu_texture_destroyed(
            &native,
            &target.depth_stencil_texture
        ));
    }
}

mod draw_wgpu_texture_render_target_result {
    use super::*;

    #[test]
    fn does_not_throw_with_an_open_render_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let mut target = create_wgpu_texture_render_target(&state, 64.0, 64.0, None, None, None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let state = pass.state;
        let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

        let error = capture_test_validation_error(&native, || {
            draw_wgpu_texture_render_target_result(
                state,
                1.0,
                None,
                &identity,
                &mut target,
                &identity,
            );
            submit_wgpu_frame(state);
        });
        assert!(error.is_none(), "{error:?}");
    }

    // In the source the target is itself the sampled entry, so the bind group a draw builds stays on
    // it; the next draw with the same sampler reuses that group rather than building another.
    #[test]
    fn keeps_the_bind_group_a_draw_builds_on_the_target() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut target = create_wgpu_texture_render_target(&state, 64.0, 64.0, None, None, None);
        assert!(target.bindings.is_empty());
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let state = pass.state;
        let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);

        draw_wgpu_texture_render_target_result(state, 1.0, None, &identity, &mut target, &identity);
        assert_eq!(target.bindings.len(), 1);
        let first = target.bindings.values().next().unwrap().clone();
        draw_wgpu_texture_render_target_result(state, 1.0, None, &identity, &mut target, &identity);
        assert_eq!(target.bindings.len(), 1);
        assert_eq!(target.bindings.values().next().unwrap(), &first);
        submit_wgpu_frame(state);
    }
}

mod initialize_wgpu_texture_render_target {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_texture_render_target() {
        let state = create_wgpu_render_state_for_test(None);
        let mut target = create_wgpu_texture_render_target(&state, 16.0, 16.0, None, None, None);
        let previous = target.texture.clone();

        initialize_wgpu_texture_render_target(
            &mut target,
            &state,
            32.0,
            24.0,
            Some(wgpu::TextureFormat::Rgba16Float),
            Some(RenderTargetColorSpace::Linear),
            Some(4),
        );

        assert_ne!(target.texture, previous);
        assert_eq!(target.width, 64);
        assert_eq!(target.height, 48);
        assert_eq!(target.sample_count, 4);
        assert_eq!(target.format, wgpu::TextureFormat::Rgba16Float);
        assert_eq!(target.texture.format(), wgpu::TextureFormat::Rgba16Float);
        assert_eq!(target.color_space, RenderTargetColorSpace::Linear);
        assert!(target.bindings.is_empty());
    }
}

mod resize_wgpu_texture_render_target {
    use super::*;

    #[test]
    fn preserves_the_allocation_when_dimensions_are_unchanged() {
        let state = create_wgpu_render_state_for_test(None);
        let mut target = create_wgpu_texture_render_target(&state, 64.0, 64.0, None, None, None);
        let texture = target.texture.clone();
        let depth_stencil_texture = target.depth_stencil_texture.clone();
        let (sampler, bind_group) = resolve_linear_bind_group(&state, &mut target);

        resize_wgpu_texture_render_target(&state, &mut target, 64.0, 64.0, None);

        assert_eq!(target.texture, texture);
        assert_eq!(target.depth_stencil_texture, depth_stencil_texture);
        // The view survived, so its cached bindings must survive with it.
        assert_eq!(target.bindings.get(&sampler), Some(&bind_group));
    }

    #[test]
    fn updates_width_height_and_drops_bindings_that_referenced_the_old_view() {
        let state = create_wgpu_render_state_for_test(None);
        let mut target = create_wgpu_texture_render_target(&state, 64.0, 64.0, None, None, None);
        let previous_view = target.view.clone();
        let (_, previous_bind_group) = resolve_linear_bind_group(&state, &mut target);
        resize_wgpu_texture_render_target(&state, &mut target, 200.0, 150.0, None);
        assert_eq!(target.width, 200);
        assert_eq!(target.height, 150);
        // Reallocation replaces the view, so every binding over the old one is dropped and rebuilt.
        assert!(target.bindings.is_empty());
        assert_ne!(target.view, previous_view);
        let (_, rebuilt) = resolve_linear_bind_group(&state, &mut target);
        assert_ne!(rebuilt, previous_bind_group);
    }

    #[test]
    fn reallocates_when_the_effective_sample_count_changes() {
        let state = create_wgpu_render_state_for_test(None);
        let mut target = create_wgpu_texture_render_target(&state, 64.0, 48.0, None, None, None);
        let previous_texture = target.texture.clone();

        resize_wgpu_texture_render_target(&state, &mut target, 64.0, 48.0, Some(4));

        assert_eq!(target.width, 128);
        assert_eq!(target.height, 96);
        assert_eq!(target.sample_count, 4);
        assert_ne!(target.texture, previous_texture);
    }

    #[test]
    fn rejects_a_supersampled_extent_beyond_the_device_texture_limit() {
        let state = create_wgpu_render_state_for_test(None);
        let mut target = create_wgpu_texture_render_target(&state, 8.0, 8.0, None, None, None);
        let max = get_wgpu_render_state_native_device(&state)
            .device
            .limits()
            .max_texture_dimension_2d;
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            resize_wgpu_texture_render_target(&state, &mut target, max as f32, 8.0, Some(4));
        }));
        let payload = result.unwrap_err();
        let message = payload
            .downcast_ref::<String>()
            .cloned()
            .unwrap_or_else(String::new);
        assert!(message.contains("exceeding maxTextureDimension2D"));
    }
}
