use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};
use flight_meshgeometry::{get_mesh_geometry_morph_bind_pose, has_mesh_geometry_skin};
use flight_render_gl::GlRenderState;
use flight_scene3d::Mesh;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};

pub type GlScene3DDeformGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;

pub fn are_gl_scene3d_deform_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state, |rt| rt.deform_guard.is_some());
}

// flight-lint: allow(conform-params) D5 caller-owned log state and injected clock replace the TS module-level singleton
pub fn enable_gl_scene3d_deform_guards(
    state: &GlRenderState,
    log_state: &LogStateRef,
    clock: GlScene3DDeformGuardClock,
) {
    let log = log_state.clone();
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.deform_guard = Some(Arc::new(move |mesh| {
            warn_gl_scene3d_mesh_drawn_undeformed(&log, clock(), mesh);
        }));
    });
}

// flight-lint: allow(f64) D1 log timestamps are millisecond JS-number values
fn warn_gl_scene3d_mesh_drawn_undeformed(
    log_state: &LogStateRef,
    now_ms: f64,
    mesh: &Mesh,
) {
    if mesh.morph.is_some() {
        let geometry = mesh.geometry.read().unwrap();
        if get_mesh_geometry_morph_bind_pose(&geometry).is_none() {
            let mut data = HashMap::new();
            data.insert(
                "message".to_string(),
                LogValue::Str(
                    "renderGlScene3D: a morphed mesh reached the draw un-blended (it will draw the bind pose) — call prepareScene3DMorph(scene) before prepareScene3DRender.".to_string(),
                ),
            );
            let _ = log_once(
                log_state,
                now_ms,
                "scene-gl:morph-drawn-without-prepare",
                LogLevel::Warn,
                LogData::Record(data).into(),
                Some("scene-gl".to_string()),
            );
        }
    }

    if mesh.skin.is_some() {
        let geometry = mesh.geometry.read().unwrap();
        if has_mesh_geometry_skin(&geometry) && mesh.state.deformed_local_bounds.is_none() {
            let mut data = HashMap::new();
            data.insert(
                "message".to_string(),
                LogValue::Str(
                    "renderGlScene3D: a GPU-skinned mesh reached the draw un-posed (its joint palette is uncomputed, collapsing it to the origin) — call prepareScene3DSkinning(scene) before prepareScene3DRender.".to_string(),
                ),
            );
            let _ = log_once(
                log_state,
                now_ms,
                "scene-gl:skin-drawn-without-prepare",
                LogLevel::Warn,
                LogData::Record(data).into(),
                Some("scene-gl".to_string()),
            );
        }
    }
}
