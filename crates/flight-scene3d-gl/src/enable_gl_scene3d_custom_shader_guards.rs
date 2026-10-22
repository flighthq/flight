use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use flight_render_gl::GlRenderState;
use glow::{HasContext, NativeProgram};

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};

pub type GlScene3DCustomShaderGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

pub fn are_gl_scene3d_custom_shader_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.custom_shader_guard.is_some());
}

// flight-lint: allow(conform-params) D5 caller-owned log state and injected clock replace the TS module-level singleton
pub fn enable_gl_scene3d_custom_shader_guards(
    state: &GlRenderState,
    log_state: &LogStateRef,
    clock: GlScene3DCustomShaderGuardClock,
) {
    let log = log_state.clone();
    let checked = Arc::new(Mutex::new(HashSet::<NativeProgram>::new()));
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.custom_shader_guard = Some(Arc::new(move |st, program, shader_key| {
            warn_gl_custom_shader_uniform_types(&log, clock(), st, &checked, program, shader_key);
        }));
    });
}

fn gl_uniform_type_name(utype: u32) -> &'static str {
    return match utype {
        glow::FLOAT_MAT4 => "mat4",
        glow::FLOAT_MAT3 => "mat3",
        glow::FLOAT_MAT2 => "mat2",
        glow::FLOAT_VEC4 => "vec4",
        glow::FLOAT_VEC3 => "vec3",
        glow::FLOAT_VEC2 => "vec2",
        glow::FLOAT => "float",
        _ => "gl-type-unknown",
    };
}

// flight-lint: allow(f64) D1 log timestamps are millisecond JS-number values
fn warn_gl_custom_shader_uniform_types(
    log_state: &LogStateRef,
    now_ms: f64,
    state: &GlRenderState,
    checked: &Mutex<HashSet<NativeProgram>>,
    program: NativeProgram,
    shader_key: &str,
) {
    {
        let mut set = checked.lock().unwrap();
        if set.contains(&program) {
            return;
        }
        set.insert(program);
    }

    let expected: &[(&str, u32)] = &[
        ("u_model", glow::FLOAT_MAT4),
        ("u_viewProjection", glow::FLOAT_MAT4),
        ("u_normalMatrix", glow::FLOAT_MAT3),
        ("u_cameraPosition", glow::FLOAT_VEC3),
    ];

    let gl = &state.gl;
    let count = unsafe { gl.get_active_uniforms(program) };
    for i in 0..count {
        let info = unsafe { gl.get_active_uniform(program, i) };
        let info = match info {
            Some(info) => info,
            None => continue,
        };
        let want = expected.iter().find(|(name, _)| *name == info.name);
        let (_, want_type) = match want {
            Some(w) => w,
            None => continue,
        };
        if info.utype == *want_type {
            continue;
        }
        let mut data = HashMap::new();
        data.insert(
            "message".to_string(),
            LogValue::Str(format!(
                "glCustomShaderMeshMaterialRenderer: shader \"{}\" declares {} as {} but the renderer uploads it as {} — the mismatched upload raises a silent GL_INVALID_OPERATION and the draw is dropped. Declare '{} {}' in the shader.",
                shader_key,
                info.name,
                gl_uniform_type_name(info.utype),
                gl_uniform_type_name(*want_type),
                gl_uniform_type_name(*want_type),
                info.name,
            )),
        );
        let _ = log_once(
            log_state,
            now_ms,
            &format!("scene-gl:custom-shader-uniform-type:{}:{}", shader_key, info.name),
            LogLevel::Warn,
            LogData::Record(data).into(),
            Some("scene-gl".to_string()),
        );
    }
}
