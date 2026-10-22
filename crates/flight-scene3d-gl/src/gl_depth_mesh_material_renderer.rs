// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use std::rc::Rc;
use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{DEPTH_MATERIAL_KIND, DepthMaterial, Material3D};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState};
use glow::HasContext;

use crate::gl_debug_prelude::{bind_gl_debug_range, ensure_gl_debug_program};
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlDebugDefineKey, GlDebugMode, GlMeshProgramRef};

// The built-in Depth forward renderer (GlMeshMaterialRenderer for DepthMaterialKind). A lighting-
// independent debug/utility pass material: bind selects the debug program in depth mode, uploads the
// camera view-projection + view matrices, and sets the material's [near, far] linearization range;
// draw issues the indexed draw. The vertex stage carries positive view-axis depth so perspective and
// orthographic cameras produce the same grayscale LINEAR meaning. Lights are ignored. See
// register_gl_depth_material to install it.
pub static GL_DEPTH_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_depth_mesh_material,
    draw: draw_gl_depth_mesh_material,
};

fn bind_gl_depth_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    _lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let depth = material.and_then(|material| material.as_any().downcast_ref::<DepthMaterial>());
    let program = ensure_gl_debug_program(
        state,
        &GlDebugDefineKey {
            has_instances: None,
            has_normal_map: false,
            has_skin: None,
            mode: GlDebugMode::Depth,
        },
    );
    let family: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(state, &family, depth.is_some_and(|depth| depth.double_sided));
    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        state.gl.uniform_matrix_4_f32_slice(
            program.loc_view.as_ref(),
            false,
            &camera.view.read().unwrap().m,
        );
    }

    let Some(depth) = depth else {
        bind_gl_debug_range(state, &program, 0.0, 1.0);
        return;
    };
    bind_gl_debug_range(state, &program, depth.near, depth.far);
}

fn draw_gl_depth_mesh_material(state: &mut GlRenderState, proxy: &Scene3DRenderProxy, geometry: &MeshGeometry) {
    let program = get_gl_scene3d_runtime(state).active_mesh_program.clone();
    let Some(program) = program else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

// Registers the built-in Depth renderer for DepthMaterialKind on this state. Opt-in (no top-level side
// effect); call once per GlRenderState before drawScene3D so meshes with DepthMaterials draw.
pub fn register_gl_depth_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        DEPTH_MATERIAL_KIND.to_string(),
        &GL_DEPTH_MESH_MATERIAL_RENDERER,
    );
}
