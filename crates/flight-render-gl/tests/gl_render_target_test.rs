use flight_render::{RenderTargetAxes, RenderTargetDepth, RenderTargetFormat};
use flight_texture::RenderTargetColorSpace;

fn axes(width: u32, height: u32) -> RenderTargetAxes {
    return RenderTargetAxes {
        width,
        height,
        format: RenderTargetFormat::Rgba8,
        color_attachments: 1,
        color_formats: vec![RenderTargetFormat::Rgba8],
        sample_count: 1,
        depth: RenderTargetDepth::None,
        color_space: RenderTargetColorSpace::Srgb,
    };
}

mod create_gl_screen_render_target {
    use crate::gl_test_helper::make_gl;
    use flight_render_gl::{GlRenderTarget, create_gl_screen_render_target};
    use std::rc::Rc;
    #[test]
    fn retains_dimensions_context_and_srgb_default() {
        let gl = make_gl();
        let target = create_gl_screen_render_target(Rc::clone(&gl), 800, 600);
        assert_eq!((target.width(), target.height()), (800, 600));
        assert!(Rc::ptr_eq(target.gl(), &gl));
    }
}

mod create_gl_texture_render_target {
    use crate::gl_test_helper::{calls_named, make_state, make_target_descriptor};
    use flight_render_gl::create_gl_texture_render_target;
    #[test]
    fn allocates_color_storage_and_restores_the_tracked_framebuffer() {
        let state = make_state();
        let target =
            create_gl_texture_render_target(&state, &make_target_descriptor(12.2, 7.1), None)
                .unwrap()
                .unwrap();
        assert_eq!((target.axes.width, target.axes.height), (13, 8));
        assert_eq!(target.textures.len(), 1);
        assert!(calls_named("framebuffer_texture_2d") >= 1);
    }
}

mod declare_gl_render_target_color_space {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{
        GlRenderTarget, begin_gl_render_pass, create_gl_screen_render_target,
        declare_gl_render_target_color_space,
    };
    use flight_texture::RenderTargetColorSpace;
    use std::rc::Rc;
    #[test]
    fn changes_only_the_current_target() {
        let state = make_state();
        let mut target = create_gl_screen_render_target(Rc::clone(&state.gl), 4, 4);
        assert!(!declare_gl_render_target_color_space(
            &state,
            &mut target,
            RenderTargetColorSpace::Linear
        ));
        begin_gl_render_pass(&state, &target, None, None).unwrap();
        assert!(declare_gl_render_target_color_space(
            &state,
            &mut target,
            RenderTargetColorSpace::Linear
        ));
        assert_eq!(target.color_space(), RenderTargetColorSpace::Linear);
    }
}

mod destroy_gl_texture_render_target {
    use crate::gl_test_helper::{calls_named, make_state, make_texture_target};
    use flight_render_gl::destroy_gl_texture_render_target;
    #[test]
    fn explicitly_deletes_owned_resources_exactly_once() {
        let state = make_state();
        let mut target = make_texture_target(&state, 2.0, 2.0);
        destroy_gl_texture_render_target(&mut target);
        let deletes = calls_named("delete_name");
        destroy_gl_texture_render_target(&mut target);
        assert!(target.destroyed);
        assert_eq!(calls_named("delete_name"), deletes);
    }
}

mod draw_gl_texture_render_target_result {
    use super::axes;
    use crate::gl_test_helper::{make_delete_queue, make_proxy, make_state};
    use flight_geometry::create_matrix;
    use flight_render_gl::{
        GlTextureRenderTargetStorage, acquire_gl_render_pass_handle,
        create_gl_screen_render_target, draw_gl_texture_render_target_result,
        initialize_gl_texture_render_target,
    };
    use glow::HasContext;
    use std::rc::Rc;
    #[test]
    fn skips_zero_sized_targets_without_mutating_draw_state() {
        let mut state = make_state();
        let framebuffer = unsafe { state.gl.create_framebuffer() }.unwrap();
        let texture = unsafe { state.gl.create_texture() }.unwrap();
        let storage = GlTextureRenderTargetStorage {
            axes: axes(0, 0),
            framebuffer,
            resolve_framebuffer: None,
            textures: vec![texture],
            depth_texture: None,
            color_renderbuffers: vec![],
            depth_stencil_renderbuffer: None,
        };
        let target = initialize_gl_texture_render_target(
            Rc::clone(&state.gl),
            axes(0, 0),
            storage,
            make_delete_queue(),
        )
        .unwrap();
        let screen = create_gl_screen_render_target(Rc::clone(&state.gl), 1, 1);
        let pass = acquire_gl_render_pass_handle(&state, &screen);
        let proxy = make_proxy(&mut state);
        assert!(
            draw_gl_texture_render_target_result(
                &mut state,
                &pass,
                &proxy,
                &target,
                &create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
            )
            .is_ok()
        );
    }
}

mod explain_gl_texture_render_target {
    use crate::gl_test_helper::{make_state, make_texture_target};
    use flight_render_gl::explain_gl_texture_render_target;
    #[test]
    fn reports_requested_and_effective_axes() {
        let state = make_state();
        let target = make_texture_target(&state, 3.2, 4.2);
        let explanation = explain_gl_texture_render_target(&target);
        assert_eq!(explanation.effective, target.axes);
        assert_eq!(explanation.requested, target.requested_axes);
    }
}

mod initialize_gl_texture_render_target {
    use super::axes;
    use crate::gl_test_helper::{make_delete_queue, make_gl};
    use flight_render_gl::{GlTextureRenderTargetStorage, initialize_gl_texture_render_target};
    use glow::HasContext;
    use std::rc::Rc;
    #[test]
    fn rejects_storage_without_color_attachment_zero() {
        let gl = make_gl();
        let framebuffer = unsafe { gl.create_framebuffer() }.unwrap();
        let storage = GlTextureRenderTargetStorage {
            axes: axes(1, 1),
            framebuffer,
            resolve_framebuffer: None,
            textures: vec![],
            depth_texture: None,
            color_renderbuffers: vec![],
            depth_stencil_renderbuffer: None,
        };
        assert!(
            initialize_gl_texture_render_target(
                Rc::clone(&gl),
                axes(1, 1),
                storage,
                make_delete_queue()
            )
            .is_err()
        );
    }
}

mod is_gl_render_target_format_supported {
    use crate::gl_test_helper::make_state;
    use flight_render::RenderTargetFormat;
    use flight_render_gl::is_gl_render_target_format_supported;
    #[test]
    fn always_supports_rgba8_but_requires_the_float_extension_for_float_targets() {
        let state = make_state();
        assert!(is_gl_render_target_format_supported(
            &state,
            RenderTargetFormat::Rgba8
        ));
        assert!(!is_gl_render_target_format_supported(
            &state,
            RenderTargetFormat::Rgba16F
        ));
    }
}

mod resize_gl_texture_render_target {
    use crate::gl_test_helper::{make_state, make_texture_target};
    use flight_render_gl::resize_gl_texture_render_target;
    #[test]
    fn reallocates_storage_and_updates_effective_dimensions() {
        let state = make_state();
        let mut target = make_texture_target(&state, 2.0, 2.0);
        resize_gl_texture_render_target(&state, &mut target, 9.1, 5.1).unwrap();
        assert_eq!((target.axes.width, target.axes.height), (10, 6));
    }
}

mod resolve_gl_render_target_axes {
    use crate::gl_test_helper::{make_state, make_target_descriptor};
    use flight_render_gl::resolve_gl_render_target_axes;
    #[test]
    fn normalizes_fractional_dimensions() {
        let state = make_state();
        let axes =
            resolve_gl_render_target_axes(&state, &make_target_descriptor(4.2, 8.8), None).unwrap();
        assert_eq!((axes.width, axes.height), (5, 9));
    }
}

mod resolve_gl_texture_render_target {
    use crate::gl_test_helper::{calls_named, make_state, make_texture_target};
    use flight_render_gl::resolve_gl_texture_render_target;
    #[test]
    fn leaves_single_sample_targets_unresolved() {
        let state = make_state();
        let target = make_texture_target(&state, 2.0, 2.0);
        let before = calls_named("blit_framebuffer");
        resolve_gl_texture_render_target(&state, &target);
        assert_eq!(calls_named("blit_framebuffer"), before);
    }
}

mod resolve_renderable_format {
    use crate::gl_test_helper::make_gl;
    use flight_render::{RenderTargetFormat, RenderTargetFormatPolicy};
    use flight_render_gl::resolve_renderable_format;
    #[test]
    fn falls_back_only_for_preferred_unsupported_float_formats() {
        let gl = make_gl();
        assert_eq!(
            resolve_renderable_format(
                &gl,
                RenderTargetFormat::Rgba16F,
                RenderTargetFormatPolicy::Preferred
            ),
            Some(RenderTargetFormat::Rgba8)
        );
        assert_eq!(
            resolve_renderable_format(
                &gl,
                RenderTargetFormat::Rgba16F,
                RenderTargetFormatPolicy::Required
            ),
            None
        );
    }
}
