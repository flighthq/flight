use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_lighting::Scene3DLightBlock;
use flight_log::{
    LogData, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_materials::custom_shader_material::create_custom_shader_material;
use flight_render_gl::GlCustomMaterialShaderSource;
use flight_scene3d_gl::contract::*;

use crate::gl_test_helper::{make_gl_scene3d_state, set_active_uniforms};

// GL uniform-type enums the mock and the guard compare against (WebGL2 spec values).
const GL_FLOAT_MAT3: u32 = 0x8b5b;
const GL_FLOAT_MAT4: u32 = 0x8b5c;

fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 0.1;
    let projection = create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = 1.0;
        projection.fov_y = std::f32::consts::PI / 3.0;
    }
    camera.projection = Projection::Perspective(projection);
    return camera;
}

fn no_lights() -> Scene3DLightBlock {
    return Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0_f32; 12].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    };
}

// Binds a custom-shader material under `shader_key` with the guard installed, against a mock context
// whose active uniforms are `active_uniforms`, and returns the messages the guard emitted.
fn bind_with_guard(shader_key: &str, active_uniforms: &[(&str, u32)]) -> Vec<String> {
    let mut state = make_gl_scene3d_state();
    set_active_uniforms(active_uniforms);
    register_gl_custom_material_shader(
        &mut state,
        shader_key,
        &GlCustomMaterialShaderSource {
            fragment: "frag".to_string(),
            vertex: "vert".to_string(),
        },
    );
    let log_state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&log_state, sink.sink.clone());
    enable_gl_scene3d_custom_shader_guards(&state, Some(log_state));

    let mut material = create_custom_shader_material();
    material.shader_key = shader_key.to_string();
    (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
    (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());

    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, &sink);
    return entries
        .iter()
        .map(|entry| match &entry.data {
            LogData::Message(message) => message.clone(),
            LogData::Record(data) => match data.get("message") {
                Some(LogValue::Str(message)) => message.clone(),
                _ => String::new(),
            },
        })
        .collect();
}

mod are_gl_scene3d_custom_shader_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_until_guards_are_installed_then_true() {
        let state = make_gl_scene3d_state();
        assert!(!are_gl_scene3d_custom_shader_guards_enabled(&state));
        enable_gl_scene3d_custom_shader_guards(&state, None);
        assert!(are_gl_scene3d_custom_shader_guards_enabled(&state));
    }
}

mod enable_gl_scene3d_custom_shader_guards {
    use super::*;

    #[test]
    fn warns_once_naming_the_fix_when_u_normal_matrix_is_declared_mat4_instead_of_mat3() {
        let messages = bind_with_guard("badNormalMatrix", &[("u_normalMatrix", GL_FLOAT_MAT4)]);
        assert_eq!(messages.len(), 1);
        assert!(messages[0].contains("u_normalMatrix"));
        assert!(messages[0].contains("declares u_normalMatrix as mat4"));
        assert!(messages[0].contains("Declare 'mat3 u_normalMatrix'"));
    }

    #[test]
    fn stays_silent_when_the_built_in_uniforms_are_declared_with_the_expected_types() {
        let messages = bind_with_guard(
            "okNormalMatrix",
            &[
                ("u_normalMatrix", GL_FLOAT_MAT3),
                ("u_model", GL_FLOAT_MAT4),
                ("u_viewProjection", GL_FLOAT_MAT4),
            ],
        );
        assert!(messages.is_empty());
    }

    #[test]
    fn ignores_non_built_in_uniforms_so_a_custom_mat4_uniform_is_not_flagged() {
        let messages = bind_with_guard("customUniform", &[("u_userTransform", GL_FLOAT_MAT4)]);
        assert!(messages.is_empty());
    }
}
