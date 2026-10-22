mod are_gl_texture_resolver_guards_enabled {
    use flight_render_gl::{
        are_gl_texture_resolver_guards_enabled, enable_gl_texture_resolver_guards,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn delegates_to_the_render_registry_guard_state() {
        let mut state = make_state();
        assert!(!are_gl_texture_resolver_guards_enabled(&state));
        enable_gl_texture_resolver_guards(&mut state, None);
        assert!(are_gl_texture_resolver_guards_enabled(&state));
    }
}

mod enable_gl_texture_resolver_guards {
    use std::sync::{Arc, RwLock};

    use flight_log::{
        add_log_sink, create_log_state, create_memory_log_sink, get_memory_log_sink_entries,
        LogData, LogValue,
    };
    use flight_render_gl::{
        are_gl_texture_resolver_guards_enabled, enable_gl_texture_resolver_guards,
        register_gl_texture_resolver, resolve_gl_texture, GlRenderState, GlTextureRealization,
    };
    use flight_texture::{TextureColorSpace, TextureVariant};

    use crate::gl_test_helper::{make_render_texture, make_state};

    fn no_texture(
        _state: &mut GlRenderState,
        _texture: &dyn TextureVariant,
        _premultiply: bool,
        _color_space: TextureColorSpace,
    ) -> Option<GlTextureRealization> {
        return None;
    }

    #[test]
    fn is_idempotent_and_accepts_an_absent_log_sink() {
        let mut state = make_state();
        enable_gl_texture_resolver_guards(&mut state, None);
        enable_gl_texture_resolver_guards(&mut state, None);
        assert!(are_gl_texture_resolver_guards_enabled(&state));
    }

    #[test]
    fn warns_once_for_a_missing_resolver_and_stays_silent_for_a_registered_null_result() {
        let mut state = make_state();
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(4);
        add_log_sink(&log_state, sink.sink.clone());
        enable_gl_texture_resolver_guards(&mut state, Some(log_state));
        let missing = make_render_texture(1, 1);

        assert!(resolve_gl_texture(&mut state, &missing, None, None).is_none());
        assert!(resolve_gl_texture(&mut state, &missing, None, None).is_none());
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        let LogData::Record(data) = &entries[0].data else {
            panic!("resolver diagnostic must carry structured data");
        };
        let Some(LogValue::Str(kind)) = data.get("kind") else {
            panic!("resolver diagnostic must carry the missing kind");
        };
        assert_eq!(kind, flight_render::RENDER_TARGET_TEXTURE_SOURCE_KIND);
        let Some(LogValue::Str(message)) = data.get("message") else {
            panic!("resolver diagnostic must carry a message");
        };
        assert_eq!(
            message,
            "resolveGlTexture: texture source kind has no registered resolver — rebuild the GlRenderRegistries with the required resolver and create the render state from that registry"
        );

        register_gl_texture_resolver(
            &mut state,
            flight_render::RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
            Some(no_texture),
        );
        assert!(resolve_gl_texture(&mut state, &missing, None, None).is_none());
        entries.clear();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
    }
}
