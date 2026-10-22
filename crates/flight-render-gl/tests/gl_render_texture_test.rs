// flight-lint: allow-file(test-default-call) Render texture option records use canonical defaults.
fn texture(width: u32, height: u32) -> flight_render::RenderTexture {
    return crate::gl_test_helper::make_render_texture(width, height);
}

mod bind_gl_render_texture {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{bind_gl_render_texture, write_gl_render_texture_target};
    #[test]
    fn binds_only_ready_realizations() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        assert!(bind_gl_render_texture(&mut state, &texture, None).is_none());
        write_gl_render_texture_target(&mut state, &mut texture, |_state, _target| Ok(())).unwrap();
        assert!(bind_gl_render_texture(&mut state, &texture, None).is_some());
    }
}
mod clear_gl_render_texture {
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::{
        GlRenderTextureStatus, clear_gl_render_texture, explain_gl_render_texture,
    };
    #[test]
    fn realizes_clears_and_marks_ready() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        clear_gl_render_texture(&mut state, &mut texture).unwrap();
        assert_eq!(
            explain_gl_render_texture(&state, &texture).status,
            GlRenderTextureStatus::Ready
        );
        assert_eq!(calls_named("clear_buffer_f32"), 1);
    }
}
mod destroy_gl_render_texture {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{destroy_gl_render_texture, write_gl_render_texture_target};
    #[test]
    fn removes_and_destroys_the_context_owned_entry() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        write_gl_render_texture_target(&mut state, &mut texture, |_state, _target| Ok(())).unwrap();
        destroy_gl_render_texture(&state, &texture);
        assert!(
            state
                .context_state
                .runtime_state
                .borrow()
                .texture_caches
                .render_target_by_source_entity
                .is_empty()
        );
    }
}
mod explain_gl_render_texture {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{GlRenderTextureStatus, explain_gl_render_texture};
    #[test]
    fn reports_source_dimensions_before_realization() {
        let state = make_state();
        let texture = super::texture(7, 9);
        assert_eq!(
            explain_gl_render_texture(&state, &texture),
            flight_render_gl::GlRenderTextureExplanation {
                width: 7,
                height: 9,
                status: GlRenderTextureStatus::Unrendered
            }
        );
    }
}
mod get_gl_render_texture_color_space {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::get_gl_render_texture_color_space;
    use flight_texture::TextureColorSpace;
    #[test]
    fn falls_back_to_texture_color_space_before_realization() {
        let state = make_state();
        let texture = super::texture(1, 1);
        assert_eq!(
            get_gl_render_texture_color_space(&state, &texture),
            TextureColorSpace::Linear
        );
    }
}
mod get_gl_render_texture_target {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{get_gl_render_texture_target, write_gl_render_texture_target};
    #[test]
    fn returns_only_ready_entries() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        assert!(get_gl_render_texture_target(&mut state, &texture).is_none());
        write_gl_render_texture_target(&mut state, &mut texture, |_state, _target| Ok(())).unwrap();
        assert!(get_gl_render_texture_target(&mut state, &texture).is_some());
    }
}
mod invalidate_gl_render_texture {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{
        GlRenderTextureStatus, explain_gl_render_texture, invalidate_gl_render_texture,
        write_gl_render_texture_target,
    };
    #[test]
    fn writes_the_requested_status_to_an_existing_entry() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        write_gl_render_texture_target(&mut state, &mut texture, |_state, _target| Ok(())).unwrap();
        invalidate_gl_render_texture(&state, &texture, Some(GlRenderTextureStatus::Released));
        assert_eq!(
            explain_gl_render_texture(&state, &texture).status,
            GlRenderTextureStatus::Released
        );
    }
}
mod is_gl_render_texture_ready {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{is_gl_render_texture_ready, write_gl_render_texture_target};
    #[test]
    fn follows_the_entry_status() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        assert!(!is_gl_render_texture_ready(&mut state, &texture));
        write_gl_render_texture_target(&mut state, &mut texture, |_state, _target| Ok(())).unwrap();
        assert!(is_gl_render_texture_ready(&mut state, &texture));
    }
}
mod render_into_gl_render_texture {
    use flight_render::RenderTargetClear;
    use crate::gl_test_helper::{calls_named, make_state};
    use flight_render_gl::render_into_gl_render_texture;
    #[test]
    fn brackets_callback_with_a_pass_and_restores_state() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        let mut called = false;
        let clear = RenderTargetClear {
            color: None,
            colors: None,
            depth: None,
            stencil: None,
        };
        render_into_gl_render_texture(
            &mut state,
            &mut texture,
            |_state, _pass| {
                called = true;
                Ok(())
            },
            &clear,
        )
        .unwrap();
        assert!(called);
        assert!(state.gl_runtime.borrow().current_pass.is_none());
        assert!(calls_named("bind_framebuffer") >= 2);
    }
}
mod set_gl_render_texture_guard {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{
        GlRenderState, GlRenderTextureExplanation, set_gl_render_texture_guard,
    };
    use flight_texture::TextureVariant;
    fn guard(
        _state: &mut GlRenderState,
        _texture: &dyn TextureVariant,
        _explanation: &GlRenderTextureExplanation,
    ) {
    }
    #[test]
    fn installs_and_removes_the_guard_pointer() {
        let state = make_state();
        set_gl_render_texture_guard(&state, Some(guard));
        assert!(state.gl_runtime.borrow().render_texture_guard.is_some());
        set_gl_render_texture_guard(&state, None);
        assert!(state.gl_runtime.borrow().render_texture_guard.is_none());
    }
}
mod write_gl_render_texture_target {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{
        GlRenderTextureStatus, explain_gl_render_texture, write_gl_render_texture_target,
    };
    use flight_texture::TextureUvTransform;
    #[test]
    fn commits_status_color_space_version_and_callback_value() {
        let mut state = make_state();
        let mut texture = super::texture(2, 2);
        let version = texture.texture_fields().version;
        let value = write_gl_render_texture_target(&mut state, &mut texture, |_state, target| {
            Ok(target.axes.width)
        })
        .unwrap();
        assert_eq!(value, 2);
        assert_eq!(texture.texture_fields().version, version.wrapping_add(1));
        assert_eq!(
            explain_gl_render_texture(&state, &texture).status,
            GlRenderTextureStatus::Ready
        );
    }
}
