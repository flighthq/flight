mod explain_gl_texture_resolution {
    use crate::gl_test_helper::{make_render_texture, make_state};
    use flight_render_gl::{
        TextureResolutionStatus, explain_gl_texture_resolution, register_gl_render_texture_resolver,
    };
    use flight_texture::create_texture_2d;

    #[test]
    fn distinguishes_missing_kind_missing_resolver_and_registered() {
        let mut state = make_state();
        let empty = create_texture_2d(None);
        assert_eq!(
            explain_gl_texture_resolution(&state, &empty).status,
            TextureResolutionStatus::MissingKind
        );
        let texture = make_render_texture(2, 3);
        assert_eq!(
            explain_gl_texture_resolution(&state, &texture).status,
            TextureResolutionStatus::MissingResolver
        );
        register_gl_render_texture_resolver(&mut state);
        let explanation = explain_gl_texture_resolution(&state, &texture);
        assert_eq!(explanation.status, TextureResolutionStatus::Registered);
        assert!(explanation.kind.is_some());
    }
}
