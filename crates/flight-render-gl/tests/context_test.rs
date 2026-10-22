mod create_gl_context {
    use std::sync::Arc;

    use flight_host::GlContext;
    use flight_render_gl::{GlContextToken, create_gl_context};

    use crate::gl_test_helper::proc_address;

    #[test]
    fn rejects_foreign_host_tokens_with_the_public_diagnostic() {
        let host = GlContext {
            provider: Arc::new(()),
            handle: Arc::new("foreign"),
        };
        // SAFETY: no platform pointer is dereferenced on the rejected-token path.
        let error = unsafe { create_gl_context(&host) }.unwrap_err();
        assert!(error.contains("not a flight-render-gl GlContextToken"));
    }

    #[test]
    fn narrows_the_host_token_and_builds_the_thread_bound_context() {
        let host = GlContext {
            provider: Arc::new(()),
            handle: Arc::new(GlContextToken {
                get_proc_address: Arc::new(proc_address),
            }),
        };
        // SAFETY: the token resolves every entry point exercised by construction to local mocks.
        assert!(unsafe { create_gl_context(&host) }.is_ok());
    }
}
