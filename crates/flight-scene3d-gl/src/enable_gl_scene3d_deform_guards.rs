use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_meshgeometry::{get_mesh_geometry_morph_bind_pose, has_mesh_geometry_skin};
use flight_render_gl::GlRenderState;
use flight_scene3d::Mesh;
use flight_scene3d::contract::get_mesh_runtime;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;

// Returns whether the scene deform guard is installed on `state`.
pub fn are_gl_scene3d_deform_guards_enabled(state: &GlRenderState) -> bool {
    return get_gl_scene3d_runtime(state).deform_guard.is_some();
}

// Installs the shakeable scene deform guard on `state`: render_gl_scene3d calls it once per visible
// mesh, and it warns when a morphed or GPU-skinned mesh reaches the draw without its deform pass having
// run — prepare_scene3d_morph for a morph, prepare_scene3d_skinning for a skin. Both are silent-black
// footguns. Not calling this costs the draw nothing. Idempotent. Warnings go to `log_state`, kept as
// the state's guard log.
// flight-lint: allow(conform-params) D5 caller-owned LogState replaces the TS logging singleton
pub fn enable_gl_scene3d_deform_guards(state: &GlRenderState, log_state: Option<LogStateRef>) {
    if log_state.is_some() {
        state.gl_runtime.borrow_mut().guard_log = log_state;
    }
    get_gl_scene3d_runtime(state).deform_guard = Some(warn_gl_scene3d_mesh_drawn_undeformed);
}

fn warn_once(log_state: &LogStateRef, key: &str, message: &str) {
    let mut data = HashMap::new();
    data.insert("message".to_string(), LogValue::Str(message.to_string()));
    log_once(
        log_state,
        0.0,
        key,
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("scene-gl".to_string()),
    );
}

// A morphed mesh whose base pose was never captured has never been blended (prepare_scene3d_morph did
// not run). A GPU-skinned mesh whose runtime carries no posed bounds was never readied by
// prepare_scene3d_skinning, so its joint palette is uncomputed. One warning per key.
fn warn_gl_scene3d_mesh_drawn_undeformed(state: &GlRenderState, mesh: &Mesh) {
    let Some(log_state) = state.gl_runtime.borrow().guard_log.clone() else {
        return;
    };
    let geometry = mesh.geometry.read().unwrap();
    if mesh.morph.is_some() && get_mesh_geometry_morph_bind_pose(&geometry).is_none() {
        warn_once(
            &log_state,
            "scene-gl:morph-drawn-without-prepare",
            "renderGlScene3D: a morphed mesh reached the draw un-blended (it will draw the bind pose) — call prepareScene3DMorph(scene) before prepareScene3DRender.",
        );
    }

    if mesh.skin.is_some()
        && has_mesh_geometry_skin(&geometry)
        && get_mesh_runtime(mesh).deformed_local_bounds.is_none()
    {
        warn_once(
            &log_state,
            "scene-gl:skin-drawn-without-prepare",
            "renderGlScene3D: a GPU-skinned mesh reached the draw un-posed (its joint palette is uncomputed, collapsing it to the origin) — call prepareScene3DSkinning(scene) before prepareScene3DRender.",
        );
    }
}
