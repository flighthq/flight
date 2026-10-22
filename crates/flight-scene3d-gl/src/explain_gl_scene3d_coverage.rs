use flight_render_gl::GlRenderState;
use flight_scene3d::Scene3DKindUsage;

use crate::gl_mesh_material_registry::has_gl_mesh_material_renderer;
use crate::gl_modifier_snippet_registry::has_gl_modifier_snippet;

fn collect_gl_scene3d_coverage_gaps(
    state: &GlRenderState,
    usage: &Scene3DKindUsage,
    stop_at_first: bool,
) -> bool {
    let mut found = false;

    for kind in &usage.material_kinds {
        if has_gl_mesh_material_renderer(state, kind) {
            continue;
        }
        found = true;
        if stop_at_first {
            return true;
        }
    }

    for kind in &usage.modifier_kinds {
        if has_gl_modifier_snippet(state, kind) {
            continue;
        }
        found = true;
        if stop_at_first {
            return true;
        }
    }

    return found;
}

pub fn has_gl_scene3d_coverage(state: &GlRenderState, usage: &Scene3DKindUsage) -> bool {
    return !collect_gl_scene3d_coverage_gaps(state, usage, true);
}
