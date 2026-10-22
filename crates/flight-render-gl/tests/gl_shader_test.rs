mod calculate_gl_matrix_from_values {
    use flight_render_gl::calculate_gl_matrix_from_values;

    #[test]
    fn maps_pixel_coordinates_to_clip_space_with_the_source_sign_convention() {
        let mut matrix = [0.0; 9];
        calculate_gl_matrix_from_values(&mut matrix, 2.0, 3.0, 4.0, 5.0, 25.0, 20.0, 100.0, 80.0);
        assert_eq!(
            matrix,
            [0.04, -0.075, 0.0, 0.08, -0.125, 0.0, -0.5, 0.5, 1.0]
        );
    }
}

mod compile_default_gl_program {
    use flight_render_gl::compile_default_gl_program;

    use crate::gl_test_helper::make_gl;

    #[test]
    fn resolves_required_attributes_and_optional_uniforms() {
        let gl = make_gl();
        let locations = compile_default_gl_program(&gl).unwrap();
        assert_eq!(locations.loc_position, 0);
        assert_eq!(locations.loc_tex_coord, 1);
        assert!(locations.loc_matrix.is_some());
    }
}

mod compile_gl_bitmap_program {
    use flight_render_gl::compile_gl_bitmap_program;

    use crate::gl_test_helper::make_gl;

    #[test]
    fn accepts_a_caller_fragment_source() {
        let gl = make_gl();
        assert!(compile_gl_bitmap_program(&gl, Some("void main() {}")).is_ok());
    }
}

mod create_default_gl_bitmap_shader {
    use flight_render_gl::{compile_default_gl_program, create_default_gl_bitmap_shader};

    use crate::gl_test_helper::make_gl;

    #[test]
    fn retains_the_compiled_program_and_locations() {
        let gl = make_gl();
        let locations = compile_default_gl_program(&gl).unwrap();
        let program = locations.program;
        let shader = create_default_gl_bitmap_shader(locations);
        assert_eq!(shader.program, program);
        assert_eq!(shader.locations.program, program);
    }
}

mod create_gl_bitmap_shader {
    use flight_render_gl::create_gl_bitmap_shader;

    use crate::gl_test_helper::make_gl;

    #[test]
    fn builds_a_shader_from_a_custom_fragment() {
        let gl = make_gl();
        let shader = create_gl_bitmap_shader(&gl, "void main() {}", None).unwrap();
        assert_eq!(shader.program, shader.locations.program);
    }
}

mod ensure_default_gl_bitmap_shader {
    use std::sync::Arc;

    use flight_render_gl::ensure_default_gl_bitmap_shader;

    use crate::gl_test_helper::make_state;

    #[test]
    fn compiles_once_and_reuses_the_same_shader_identity() {
        let state = make_state();
        let first = ensure_default_gl_bitmap_shader(&state).unwrap();
        let second = ensure_default_gl_bitmap_shader(&state).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod initialize_default_gl_bitmap_shader {
    use flight_render_gl::{compile_default_gl_program, initialize_default_gl_bitmap_shader};

    use crate::gl_test_helper::make_gl;

    #[test]
    fn initializes_a_direct_owned_value() {
        let gl = make_gl();
        let locations = compile_default_gl_program(&gl).unwrap();
        let shader = initialize_default_gl_bitmap_shader(locations.clone());
        assert_eq!(shader.locations, locations);
    }
}

mod initialize_gl_bitmap_shader {
    use flight_render_gl::initialize_gl_bitmap_shader;

    use crate::gl_test_helper::make_gl;

    #[test]
    fn propagates_shader_compile_failures() {
        let gl = make_gl();
        crate::gl_test_helper::set_shader_compile(false);
        assert!(initialize_gl_bitmap_shader(&gl, "bad", None).is_err());
    }
}

mod native_glsl_source {
    use flight_render_gl::native_glsl_source;

    #[test]
    fn swaps_only_the_es_version_header_for_native_gl() {
        assert_eq!(
            native_glsl_source("#version 300 es\nprecision mediump float;\nvoid main() {}"),
            "#version 330 core\nprecision mediump float;\nvoid main() {}"
        );
    }

    #[test]
    fn leaves_caller_sources_without_the_pinned_header_unchanged() {
        assert_eq!(native_glsl_source("void main() {}"), "void main() {}");
    }
}

mod set_gl_attributes {
    use flight_render_gl::{compile_default_gl_program, set_gl_attributes};

    use crate::gl_test_helper::{calls_named, make_gl};

    #[test]
    fn enables_and_describes_both_interleaved_attributes() {
        let gl = make_gl();
        let locations = compile_default_gl_program(&gl).unwrap();
        set_gl_attributes(&gl, &locations);
        assert_eq!(calls_named("enable_vertex_attrib_array"), 2);
        assert_eq!(calls_named("vertex_attrib_pointer"), 2);
    }
}

mod set_gl_base_uniforms {
    use flight_render_gl::{compile_default_gl_program, set_gl_base_uniforms};

    use crate::gl_test_helper::{calls_named, make_proxy, make_state};

    #[test]
    fn uploads_alpha_and_the_texture_zero_sampler() {
        let mut state = make_state();
        let proxy = make_proxy(&mut state);
        let locations = compile_default_gl_program(&state.gl).unwrap();
        set_gl_base_uniforms(&state.gl, &locations, &proxy.proxy);
        assert_eq!(calls_named("uniform_1_f32"), 1);
        assert_eq!(calls_named("uniform_1_i32"), 1);
    }
}

mod set_gl_matrix_from_transform {
    use flight_geometry::create_matrix;
    use flight_render_gl::{compile_default_gl_program, set_gl_matrix_from_transform};

    use crate::gl_test_helper::{calls_named, make_gl};

    #[test]
    fn converts_the_transform_and_uploads_one_matrix() {
        let gl = make_gl();
        let locations = compile_default_gl_program(&gl).unwrap();
        let transform = create_matrix(2.0, 3.0, 4.0, 5.0, 25.0, 20.0);
        let mut matrix = [0.0; 9];
        set_gl_matrix_from_transform(&gl, &locations, &mut matrix, &transform, 100.0, 80.0);
        assert_eq!(
            matrix,
            [0.04, -0.075, 0.0, 0.08, -0.125, 0.0, -0.5, 0.5, 1.0]
        );
        assert_eq!(calls_named("uniform_matrix_3_f32"), 1);
    }
}

mod set_gl_matrix_from_values {
    use flight_render_gl::{compile_default_gl_program, set_gl_matrix_from_values};

    use crate::gl_test_helper::{calls_named, make_gl};

    #[test]
    fn updates_caller_scratch_before_upload() {
        let gl = make_gl();
        let locations = compile_default_gl_program(&gl).unwrap();
        let mut matrix = [99.0; 9];
        set_gl_matrix_from_values(
            &gl,
            &locations,
            &mut matrix,
            1.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            2.0,
            2.0,
        );
        assert_eq!(matrix, [1.0, -0.0, 0.0, 0.0, -1.0, 0.0, -1.0, 1.0, 1.0]);
        assert_eq!(calls_named("uniform_matrix_3_f32"), 1);
    }
}
