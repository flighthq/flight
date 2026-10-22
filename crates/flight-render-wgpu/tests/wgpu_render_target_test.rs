use std::sync::{Arc, RwLock};

use flight_render_wgpu::*;
use flight_texture::RenderTargetColorSpace;

use crate::support::*;

fn texture_target(
    state: &WgpuRenderState,
    width: f32,
    height: f32,
    sample_count: u32,
) -> WgpuRenderTarget {
    return WgpuRenderTarget::Texture(Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state,
        width,
        height,
        None,
        None,
        Some(sample_count),
    ))));
}

mod declare_wgpu_render_target_color_space {
    use super::*;

    #[test]
    fn stamps_the_innermost_open_target_and_reports_false_outside_a_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let outer = Arc::new(RwLock::new(create_wgpu_texture_render_target(
            &state, 32.0, 32.0, None, None, None,
        )));
        let inner = Arc::new(RwLock::new(create_wgpu_texture_render_target(
            &state, 16.0, 16.0, None, None, None,
        )));

        assert!(!declare_wgpu_render_target_color_space(
            &mut state,
            RenderTargetColorSpace::Linear
        ));

        let screen_pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let outer_pass = begin_wgpu_render_pass(
            &mut *screen_pass.state,
            &WgpuRenderTarget::Texture(outer.clone()),
            None,
        );
        assert!(declare_wgpu_render_target_color_space(
            outer_pass.state,
            RenderTargetColorSpace::Linear
        ));
        let inner_pass = begin_wgpu_render_pass(
            &mut *outer_pass.state,
            &WgpuRenderTarget::Texture(inner.clone()),
            None,
        );
        assert!(declare_wgpu_render_target_color_space(
            inner_pass.state,
            RenderTargetColorSpace::Linear
        ));

        end_wgpu_render_pass(inner_pass);
        match &get_wgpu_render_state_runtime(outer_pass.state).current_render_target {
            Some(WgpuRenderTarget::Texture(current)) => assert!(Arc::ptr_eq(current, &outer)),
            _ => panic!("the outer texture target is current again"),
        }
        end_wgpu_render_pass(outer_pass);
        end_wgpu_render_pass(screen_pass);

        assert_eq!(
            outer.read().unwrap().color_space,
            RenderTargetColorSpace::Linear
        );
        assert_eq!(
            inner.read().unwrap().color_space,
            RenderTargetColorSpace::Linear
        );
    }
}

mod get_wgpu_render_target_supersample_scale {
    use super::*;

    // The source passes bare `{ sampleCount }` literals; real texture targets carry the same field.
    #[test]
    fn reports_2_for_a_supersampled_texture_target_and_1_for_a_single_sample_one() {
        let state = create_wgpu_render_state_for_test(None);
        assert_eq!(
            get_wgpu_render_target_supersample_scale(&texture_target(&state, 8.0, 8.0, 4)),
            2
        );
        assert_eq!(
            get_wgpu_render_target_supersample_scale(&texture_target(&state, 8.0, 8.0, 1)),
            1
        );
    }

    #[test]
    fn reads_a_screen_target_from_its_antialias_option_not_its_sample_count() {
        let state = create_wgpu_render_state_for_test(None);
        let plain = create_wgpu_screen_render_target_for_test(&state, None, false, 800, 600);
        let antialiased = create_wgpu_screen_render_target_for_test(&state, None, true, 800, 600);

        assert_eq!(
            get_wgpu_render_target_supersample_scale(&WgpuRenderTarget::Screen(plain)),
            1
        );
        assert_eq!(
            get_wgpu_render_target_supersample_scale(&WgpuRenderTarget::Screen(
                antialiased.clone()
            )),
            2
        );
        assert_eq!(antialiased.read().unwrap().sample_count, 1);
    }

    #[test]
    fn inverts_the_allocator_exactly_including_at_an_odd_logical_size() {
        let state = create_wgpu_render_state_for_test(None);
        for (logical, sample_count) in [(801u32, 4u32), (599, 4), (800, 1), (1, 4)] {
            let target = texture_target(&state, logical as f32, 1.0, sample_count);
            let expected = logical.max(1) * if sample_count == 4 { 2 } else { 1 };
            let WgpuRenderTarget::Texture(texture) = &target else {
                unreachable!();
            };
            let physical = texture.read().unwrap().width;
            assert_eq!(physical, expected);
            let scale = get_wgpu_render_target_supersample_scale(&target);

            assert_eq!(physical / scale, logical);
            assert_eq!(physical % scale, 0);
        }
    }

    #[test]
    fn inverts_the_screen_allocator_exactly_for_a_supersampled_surface() {
        let state = create_wgpu_render_state_for_test(None);
        let screen = create_wgpu_screen_render_target_for_test(&state, None, true, 801, 599);
        let scale =
            get_wgpu_render_target_supersample_scale(&WgpuRenderTarget::Screen(screen.clone()));
        let screen = screen.read().unwrap();

        assert_eq!(screen.width, 1602);
        assert_eq!(screen.width / scale, 801);
        assert_eq!(screen.height / scale, 599);
    }
}
