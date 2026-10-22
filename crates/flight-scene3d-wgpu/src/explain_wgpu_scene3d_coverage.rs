use flight_render_wgpu::WgpuRenderState;
use flight_scene3d::Scene3DKindUsage;

use crate::wgpu_mesh_material_registry::has_wgpu_mesh_material_renderer;
use crate::wgpu_shaded_modifier_snippet::has_wgpu_modifier_snippet;

fn collect_wgpu_scene3d_coverage_gaps(
    state: &WgpuRenderState,
    usage: &Scene3DKindUsage,
    stop_at_first: bool,
) -> bool {
    let mut found = false;

    for kind in &usage.material_kinds {
        if has_wgpu_mesh_material_renderer(state, kind) {
            continue;
        }
        found = true;
        if stop_at_first {
            return true;
        }
    }

    for kind in &usage.modifier_kinds {
        if has_wgpu_modifier_snippet(state, kind) {
            continue;
        }
        found = true;
        if stop_at_first {
            return true;
        }
    }

    return found;
}

pub fn has_wgpu_scene3d_coverage(state: &WgpuRenderState, usage: &Scene3DKindUsage) -> bool {
    return !collect_wgpu_scene3d_coverage_gaps(state, usage, true);
}
