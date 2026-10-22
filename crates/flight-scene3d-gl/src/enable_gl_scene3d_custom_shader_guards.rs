use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::GlRenderState;
use glow::{HasContext, NativeProgram};

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;

// Returns whether the scene custom-shader guard is installed on `state`
// (enable_gl_scene3d_custom_shader_guards).
pub fn are_gl_scene3d_custom_shader_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state).custom_shader_guard.is_some();
}

// Installs the shakeable custom-shader material guard on `state`. When a CustomShaderMaterial's program
// is bound, the guard introspects its active uniforms and warns once per shader when a built-in uniform
// (u_model/u_viewProjection/u_normalMatrix/u_cameraPosition) is declared with a type the renderer does
// not upload. The dominant footgun is u_normalMatrix: the renderer uploads it as mat3
// (uniformMatrix3fv), so a shader declaring `mat4 u_normalMatrix` raises a silent GL_INVALID_OPERATION
// on every draw and renders nothing. The custom-shader renderer reaches this guard only through a
// nullable runtime slot, so the production draw path references no message and no log dependency.
// Idempotent. The warnings go to `log_state`, kept as the state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_gl_scene3d_custom_shader_guards(state: &GlRenderState, log_state: Option<LogStateRef>) {
    state.gl_runtime.borrow_mut().guard_log = log_state;
    get_gl_scene3d_runtime(state).custom_shader_guard = Some(warn_gl_custom_shader_uniform_types);
}

// Maps a GL uniform-type enum to its GLSL type keyword, so a warning names the type a shader must
// declare rather than a raw enum. Only the types the built-in uniforms use (and their nearest
// neighbors) are named; anything else falls back to the raw enum so the message is still actionable.
fn gl_uniform_type_name(kind: u32) -> String {
    return match kind {
        glow::FLOAT_MAT4 => "mat4".to_string(),
        glow::FLOAT_MAT3 => "mat3".to_string(),
        glow::FLOAT_MAT2 => "mat2".to_string(),
        glow::FLOAT_VEC4 => "vec4".to_string(),
        glow::FLOAT_VEC3 => "vec3".to_string(),
        glow::FLOAT_VEC2 => "vec2".to_string(),
        glow::FLOAT => "float".to_string(),
        _ => format!("gl-type-{kind}"),
    };
}

// Introspects a just-bound custom-shader program's active uniforms and warns once per (shader, uniform)
// when a built-in uniform's declared type differs from what draw_gl_mesh_subset uploads. Only active
// (used) uniforms are reported by get_active_uniform, so a declared-but-unused u_normalMatrix — which
// the renderer skips anyway (its location resolves None) — never trips the guard. Programs are checked
// once (recorded on the scene runtime) so repeated per-frame binds do not re-introspect.
fn warn_gl_custom_shader_uniform_types(state: &GlRenderState, program: NativeProgram, shader_key: &str) {
    if !get_gl_scene3d_runtime(state)
        .custom_shader_checked_programs
        .insert(program)
    {
        return;
    }

    let gl = &state.gl;
    let expected: HashMap<&str, u32> = HashMap::from([
        ("u_model", glow::FLOAT_MAT4),
        ("u_viewProjection", glow::FLOAT_MAT4),
        ("u_normalMatrix", glow::FLOAT_MAT3),
        ("u_cameraPosition", glow::FLOAT_VEC3),
    ]);
    let log_state = state.gl_runtime.borrow().guard_log.clone();

    // SAFETY: program introspection runs on the owning GL thread.
    let count = unsafe { gl.get_program_parameter_i32(program, glow::ACTIVE_UNIFORMS) }.max(0) as u32;
    for i in 0..count {
        // SAFETY: program introspection runs on the owning GL thread.
        let Some(info) = (unsafe { gl.get_active_uniform(program, i) }) else {
            continue;
        };
        let Some(&want) = expected.get(info.name.as_str()) else {
            continue;
        };
        if info.utype == want {
            continue;
        }
        let Some(log_state) = &log_state else {
            continue;
        };
        let mut data = HashMap::new();
        data.insert(
            "message".to_string(),
            LogValue::Str(format!(
                "glCustomShaderMeshMaterialRenderer: shader \"{shader_key}\" declares {} as {} but the renderer uploads it as {} — the mismatched upload raises a silent GL_INVALID_OPERATION and the draw is dropped. Declare '{} {}' in the shader.",
                info.name,
                gl_uniform_type_name(info.utype),
                gl_uniform_type_name(want),
                gl_uniform_type_name(want),
                info.name,
            )),
        );
        log_once(
            log_state,
            0.0,
            &format!("scene-gl:custom-shader-uniform-type:{shader_key}:{}", info.name),
            LogLevel::Warn,
            LogDataOrProvider::Data(LogData::Record(data)),
            Some("scene-gl".to_string()),
        );
    }
}
