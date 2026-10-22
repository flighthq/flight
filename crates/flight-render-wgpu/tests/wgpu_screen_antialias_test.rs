use flight_render::RenderTargetClear;
use flight_render_wgpu::*;

use crate::support::*;

mod enable_wgpu_screen_render_target_antialias {
    use super::*;

    // ★ THE COST IS OPT-IN, AND THAT IS THE POINT OF THE SLOTS. A screen target that was never asked
    // for antialiasing carries no resolve hook, so the resolve pipeline and its shader are unreachable
    // from an ordinary frame loop.
    #[test]
    fn installs_the_hooks_a_plain_screen_target_does_not_carry() {
        let state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        let mut screen = screen.write().unwrap();

        assert!(!screen.antialias);
        assert!(screen.acquire_antialias_view.is_none());
        assert!(screen.encode_antialias_resolve.is_none());

        enable_wgpu_screen_render_target_antialias(&mut screen);

        assert!(screen.antialias);
        assert!(screen.acquire_antialias_view.is_some());
        assert!(screen.encode_antialias_resolve.is_some());
    }

    #[test]
    fn draws_into_supersample_storage_twice_the_surface_extent() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, true, 400, 300);
        let mut screen = screen.write().unwrap();

        let view = bind_wgpu_screen_render_target(&mut state, &mut screen);

        assert_eq!(screen.width, 800);
        assert_eq!(Some(&view), screen.antialias_view.as_ref());
        assert_ne!(Some(&view), screen.presentation_view.as_ref());
        assert!(screen.presentation_view.is_some());
        assert_eq!(
            screen.antialias_texture.as_ref().map(|t| t.width()),
            Some(800)
        );
    }

    // The source records the descriptor a fake encoder receives; a real encoder cannot be inspected,
    // so the test asserts the resolve's inputs (the presentation view it targets, the pipeline and
    // the supersample bind group) and that encoding it on a real encoder passes wgpu validation.
    #[test]
    fn resolves_the_supersample_texture_into_the_presentation_view() {
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, true, 800, 600);
        let pass = begin_wgpu_render_pass(
            &mut state,
            &WgpuRenderTarget::Screen(screen.clone()),
            Some(&RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                ..test_default()
            }),
        );
        let presentation_view = screen.read().unwrap().presentation_view.clone();
        assert!(presentation_view.is_some());
        assert!(
            get_wgpu_render_state_runtime(pass.state)
                .surface_antialias_resolve_pipeline
                .is_some()
        );
        assert!(
            screen
                .read()
                .unwrap()
                .antialias_resolve_bind_group
                .is_some()
        );

        let error = capture_test_validation_error(&native, || {
            let mut encoder = native
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
            let target = screen.read().unwrap();
            (target.encode_antialias_resolve.unwrap())(&*pass.state, &target, &mut encoder);
            native.queue.submit([encoder.finish()]);
        });

        assert!(error.is_none(), "{error:?}");
        assert_eq!(screen.read().unwrap().presentation_view, presentation_view);
        end_wgpu_render_pass(pass);
    }
}
