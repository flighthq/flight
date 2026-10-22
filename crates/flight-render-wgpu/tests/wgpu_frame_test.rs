use std::panic::{AssertUnwindSafe, catch_unwind};

use flight_render_wgpu::*;

use crate::support::*;

fn create_offscreen_for_test(screen: &WgpuRenderState) -> WgpuRenderState {
    return create_wgpu_offscreen_render_state_from_device_state(
        &screen.device_state,
        Some(&WgpuRenderStateOptions {
            format: Some(screen.format),
            ..test_default()
        }),
    );
}

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .unwrap_or_default();
}

mod begin_wgpu_frame {
    use super::*;

    #[test]
    fn opens_one_encoder_and_preserves_it_across_repeated_calls() {
        let mut state = create_wgpu_render_state_for_test(None);
        begin_wgpu_frame(&mut state);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .command_encoder
                .is_some()
        );
        let first = format!(
            "{:?}",
            get_wgpu_render_state_runtime(&state).command_encoder
        );
        begin_wgpu_frame(&mut state);
        assert_eq!(
            format!(
                "{:?}",
                get_wgpu_render_state_runtime(&state).command_encoder
            ),
            first
        );
    }
}

mod retire_wgpu_buffer {
    use super::*;

    #[test]
    fn adds_the_buffer_to_the_post_submit_destruction_ledger() {
        let mut state = create_wgpu_render_state_for_test(None);
        let buffer = get_wgpu_render_state_native_device(&state)
            .device
            .create_buffer(&wgpu::BufferDescriptor {
                label: None,
                size: 16,
                usage: wgpu::BufferUsages::UNIFORM,
                mapped_at_creation: false,
            });
        retire_wgpu_buffer(&mut state, buffer.clone());
        assert_eq!(
            get_wgpu_render_state_runtime(&state).retired_buffers,
            Some(vec![buffer])
        );
    }
}

mod retire_wgpu_texture {
    use super::*;

    #[test]
    fn adds_the_texture_to_the_post_submit_destruction_ledger() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = get_wgpu_render_state_native_device(&state)
            .device
            .create_texture(&wgpu::TextureDescriptor {
                label: None,
                size: wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
        retire_wgpu_texture(&mut state, texture.clone());
        assert_eq!(
            get_wgpu_render_state_runtime(&state).retired_textures,
            Some(vec![texture])
        );
    }
}

mod submit_wgpu_frame {
    use super::*;

    #[test]
    fn submits_and_closes_the_active_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        begin_wgpu_frame(&mut state);
        submit_wgpu_frame(&mut state);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .command_encoder
                .is_none()
        );
    }

    #[test]
    fn closes_a_pass_the_caller_left_open_rather_than_carrying_its_encoder_into_the_next_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        begin_wgpu_frame(&mut state);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        // The handle is abandoned without ending: the frame submit closes what it left open.
        std::mem::forget(pass);
        assert!(get_wgpu_render_state_runtime(&state).render_pass.is_some());

        submit_wgpu_frame(&mut state);

        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(runtime.render_pass.is_none());
        assert!(runtime.pass_stack.is_empty());
        assert!(runtime.current_render_target.is_none());
        assert!(runtime.render_target_viewport.is_none());
    }

    // A frame that only drew into texture targets has no screen to resolve or capture. Skipping that
    // work is not an optimization: the capture texture still holds the LAST VISIBLE frame, so encoding
    // a copy here would overwrite the readback buffer with a stale picture read as current.
    #[test]
    fn resolves_and_captures_nothing_when_the_frame_never_touched_a_screen_target() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 4, 4);
        enable_wgpu_screen_render_target_capture(&mut screen.write().unwrap());
        begin_wgpu_frame(&mut state);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .frame_screen_target
                .is_none()
        );

        submit_wgpu_frame(&mut state);

        assert!(screen.read().unwrap().capture_buffer.is_none());
    }
}

mod with_wgpu_frame_borrow {
    use super::*;

    #[test]
    fn returns_callback_values_and_closes_a_standalone_frame() {
        let mut screen = create_wgpu_render_state_for_test(None);
        let mut offscreen = create_offscreen_for_test(&screen);

        assert_eq!(
            with_wgpu_frame_borrow(&mut screen, &mut offscreen, |_| 42),
            42
        );
        assert!(
            get_wgpu_render_state_runtime(&screen)
                .command_encoder
                .is_none()
        );
        assert!(
            get_wgpu_render_state_runtime(&offscreen)
                .command_encoder
                .is_none()
        );
    }

    #[test]
    fn rejects_a_borrower_owned_by_a_different_gpu_device() {
        let mut owner = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        let mut borrower = create_offscreen_for_test(&other);

        let result = catch_unwind(AssertUnwindSafe(|| {
            with_wgpu_frame_borrow(&mut owner, &mut borrower, |_| {});
        }));
        assert!(panic_message(result.unwrap_err()).contains("same GPU device"));
        assert!(
            get_wgpu_render_state_runtime(&owner)
                .command_encoder
                .is_none()
        );
        assert!(
            get_wgpu_render_state_runtime(&borrower)
                .command_encoder
                .is_none()
        );
    }
}
