mod compile_gl_shader {
    use flight_render_gl::compile_gl_shader;

    use crate::gl_test_helper::{
        calls_named, calls_with, last_call, make_gl, set_info_log, set_shader_compile,
    };

    #[test]
    fn compiles_and_returns_an_owned_shader() {
        let gl = make_gl();
        let shader =
            compile_gl_shader(&gl, glow::VERTEX_SHADER, "void main(){}", Some("unit")).unwrap();
        assert_eq!(
            last_call("create_shader").integers,
            vec![i64::from(glow::VERTEX_SHADER), i64::from(shader.0.get())]
        );
        let source = last_call("shader_source");
        assert_eq!(source.integers[0], i64::from(shader.0.get()));
        assert_eq!(source.text, "void main(){}");
        assert_eq!(
            last_call("compile_shader").integers,
            vec![i64::from(shader.0.get())]
        );
    }

    #[test]
    fn deletes_a_shader_when_compilation_fails() {
        let gl = make_gl();
        set_shader_compile(false);
        set_info_log("bad source");
        let error = compile_gl_shader(&gl, glow::VERTEX_SHADER, "bad", Some("unit")).unwrap_err();
        assert_eq!(error, "unit shader compile error: bad source");
        assert_eq!(calls_named("delete_shader"), 1);
        assert_eq!(calls_with("delete_program").len(), 0);
    }
}

mod create_gl_program {
    use flight_render_gl::create_gl_program;

    use crate::gl_test_helper::{calls_named, last_call, make_gl, set_info_log, set_program_link};

    #[test]
    fn compiles_links_and_releases_both_private_shaders() {
        let gl = make_gl();
        let program =
            create_gl_program(&gl, "void main(){}", "void main(){}", Some("quad")).unwrap();
        assert_eq!(calls_named("create_shader"), 2);
        assert_eq!(calls_named("attach_shader"), 2);
        assert_eq!(calls_named("link_program"), 1);
        assert_eq!(calls_named("delete_shader"), 2);
        assert_eq!(calls_named("delete_program"), 0);
        assert_eq!(
            last_call("link_program").integers,
            vec![i64::from(program.0.get())]
        );
    }

    #[test]
    fn deletes_the_failed_program_and_both_shaders() {
        let gl = make_gl();
        set_program_link(false);
        set_info_log("link failed");
        assert_eq!(
            create_gl_program(&gl, "v", "f", Some("Widget")).unwrap_err(),
            "Widget program link error: link failed"
        );
        assert_eq!(calls_named("delete_shader"), 2);
        assert_eq!(calls_named("delete_program"), 1);
    }
}
mod link_gl_program {
    use flight_render_gl::link_gl_program;
    use glow::HasContext;

    use crate::gl_test_helper::{calls_named, last_call, make_gl, set_info_log, set_program_link};

    #[test]
    fn links_the_program_and_returns_success() {
        let gl = make_gl();
        let program = unsafe { gl.create_program() }.unwrap();
        assert!(link_gl_program(&gl, program, None).is_ok());
        assert_eq!(calls_named("link_program"), 1);
        assert_eq!(
            last_call("link_program").integers,
            vec![i64::from(program.0.get())]
        );
    }

    #[test]
    fn reports_the_labeled_link_failure() {
        let gl = make_gl();
        // SAFETY: program creation is backed by the deterministic mock.
        let program = unsafe { gl.create_program() }.unwrap();
        set_program_link(false);
        set_info_log("no link");
        assert_eq!(
            link_gl_program(&gl, program, Some("bitmap")).unwrap_err(),
            "bitmap program link error: no link"
        );
    }
}
