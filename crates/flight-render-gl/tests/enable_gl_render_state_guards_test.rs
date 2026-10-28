mod are_gl_render_state_guards_enabled {
    use flight_render_gl::{are_gl_render_state_guards_enabled, enable_gl_render_state_guards};

    use crate::gl_test_helper::make_state;

    #[test]
    fn reflects_installation_of_both_state_guards() {
        let mut state = make_state();
        assert!(!are_gl_render_state_guards_enabled(&state));
        enable_gl_render_state_guards(&mut state, None);
        assert!(are_gl_render_state_guards_enabled(&state));
        assert!(state.gl_runtime.borrow().binding_cache_guard.is_some());
    }
}

mod enable_gl_render_state_guards {
    use std::sync::{Arc, RwLock};

    use flight_log::{
        LogData, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
        get_memory_log_sink_entries,
    };
    use flight_render_gl::{are_gl_render_state_guards_enabled, enable_gl_render_state_guards};
    use glow::HasContext;

    use crate::gl_test_helper::make_state;

    #[test]
    fn installs_no_binding_guard_until_enabled() {
        let state = make_state();
        assert!(state.gl_runtime.borrow().binding_cache_guard.is_none());
    }

    #[test]
    fn installs_the_state_guards_idempotently() {
        let mut state = make_state();
        enable_gl_render_state_guards(&mut state, None);
        let render_root_guard = state.registries.render_root_guard.unwrap();
        let binding_cache_guard = state.gl_runtime.borrow().binding_cache_guard.unwrap();
        enable_gl_render_state_guards(&mut state, None);
        assert!(are_gl_render_state_guards_enabled(&state));
        assert!(state.gl_runtime.borrow().render_state_guard_log.is_none());
        assert!(std::ptr::fn_addr_eq(
            state.registries.render_root_guard.unwrap(),
            render_root_guard,
        ));
        assert!(std::ptr::fn_addr_eq(
            state.gl_runtime.borrow().binding_cache_guard.unwrap(),
            binding_cache_guard,
        ));
    }

    #[test]
    fn warns_only_when_the_bound_program_differs_from_the_cached_program() {
        let mut state = make_state();
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let sink = create_memory_log_sink(4);
        add_log_sink(&log_state, sink.sink.clone());
        enable_gl_render_state_guards(&mut state, Some(log_state));
        let cached = unsafe { state.gl.create_program() }.unwrap();
        let foreign = unsafe { state.gl.create_program() }.unwrap();
        let guard = state.gl_runtime.borrow().binding_cache_guard.unwrap();

        unsafe { state.gl.use_program(Some(cached)) };
        guard(&state, cached);
        let mut entries = Vec::new();
        get_memory_log_sink_entries(&mut entries, &sink);
        assert!(entries.is_empty());

        unsafe { state.gl.use_program(Some(foreign)) };
        guard(&state, cached);
        get_memory_log_sink_entries(&mut entries, &sink);
        assert_eq!(entries.len(), 1);
        let message = match &entries[0].data {
            LogData::Message(message) => message,
            LogData::Record(data) => {
                let Some(LogValue::Str(message)) = data.get("message") else {
                    panic!("guard diagnostic must carry a message");
                };
                message
            }
        };
        assert!(message.contains("invalidateGlRenderStateCache"));
    }
}
