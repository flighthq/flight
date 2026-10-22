// flight-lint: allow-file(test-default-call) Rust allocation scaffolding has no source constructor.
mod create_external_gl_texture {
    use crate::gl_test_helper::{make_external_options, make_state};
    use flight_render_gl::{create_external_gl_texture, resolve_gl_texture};
    use glow::HasContext;
    #[test]
    fn registers_and_resolves_the_exact_borrowed_handle() {
        let mut state = make_state();
        let stale = unsafe { state.gl.create_texture() }.unwrap();
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .current_texture_realization = Some(flight_render_gl::GlTextureRealization {
            straight_alpha: true,
            texture: stale,
        });
        let handle = unsafe { state.gl.create_texture() }.unwrap();
        let texture = create_external_gl_texture(&mut state, handle, &make_external_options(5, 7));
        assert_eq!(
            resolve_gl_texture(&mut state, &texture, None, None),
            Some(handle)
        );
        let realization = state
            .context_state
            .runtime_state
            .borrow()
            .current_texture_realization
            .unwrap();
        assert_eq!(realization.texture, handle);
        assert!(!realization.straight_alpha);
    }
}

mod dispose_external_gl_texture {
    use crate::gl_test_helper::{calls_named, make_external_options, make_state};
    use flight_render_gl::{create_external_gl_texture, dispose_external_gl_texture};
    use glow::HasContext;
    #[test]
    fn forgets_borrowed_handles_without_deleting_them() {
        let mut state = make_state();
        let handle = unsafe { state.gl.create_texture() }.unwrap();
        let texture = create_external_gl_texture(&mut state, handle, &make_external_options(0, 0));
        assert_eq!(
            flight_texture::get_texture_source_kind(&texture),
            Some(flight_render::EXTERNAL_TEXTURE_SOURCE_KIND.to_string())
        );
        let before = calls_named("delete_name");
        assert!(dispose_external_gl_texture(&state, &texture));
        assert!(!dispose_external_gl_texture(&state, &texture));
        assert_eq!(calls_named("delete_name"), before);
    }
}
mod initialize_external_gl_texture_source {
    use flight_entity::allocate_entity;
    use flight_render::ExternalTexture;
    use flight_render_gl::initialize_external_gl_texture_source;
    use flight_texture::TextureSource;
    #[test]
    fn writes_dimensions_kind_and_zero_version() {
        let mut source: ExternalTexture = allocate_entity();
        initialize_external_gl_texture_source(
            &mut source,
            &crate::gl_test_helper::make_external_options(9, 11),
        );
        let fields = source.texture_source_fields();
        assert_eq!((fields.width, fields.height, fields.version), (9, 11, 0));
        assert_eq!(fields.kind, flight_render::EXTERNAL_TEXTURE_SOURCE_KIND);
    }
}
