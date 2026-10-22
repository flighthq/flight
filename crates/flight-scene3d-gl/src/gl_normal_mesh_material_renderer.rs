// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, NORMAL_MATERIAL_KIND, NormalMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState, resolve_gl_texture};
use std::rc::Rc;

use crate::gl_debug_prelude::{bind_gl_debug_normal_map, ensure_gl_debug_program};
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlDebugDefineKey, GlDebugMode, GlMeshProgramRef};

// The built-in Normal forward renderer (GlMeshMaterialRenderer for NormalMaterialKind). A lighting-
// independent debug/utility pass material: bind selects the debug program in normal mode (with the
// normal-map variant when the material binds one), uploads the camera view-projection, and binds the
// optional tangent-space normal map plus its scale; draw issues the indexed draw. The fragment stage
// transforms the geometric normal by the normal matrix (so the visualized normal is WORLD-space),
// optionally perturbs it through a TBN-built normal map, and encodes it as `n * 0.5 + 0.5` LINEAR
// color. Lights are ignored. See register_gl_normal_material to install it.
pub static GL_NORMAL_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_normal_mesh_material,
    draw: draw_gl_normal_mesh_material,
};

fn bind_gl_normal_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    _lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let normal = material.and_then(|material| material.as_any().downcast_ref::<NormalMaterial>());
    let normal_map = normal
        .and_then(|normal| normal.normal_map.as_ref())
        .map(|map| map.read().unwrap());
    let has_normal_map = normal_map
        .as_deref()
        .is_some_and(|map| resolve_gl_texture(state, map, None, None).is_some());
    let program = ensure_gl_debug_program(
        state,
        &GlDebugDefineKey {
            has_instances: None,
            has_normal_map,
            has_skin: None,
            mode: GlDebugMode::Normal,
        },
    );
    let family: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(
        state,
        &family,
        normal.is_some_and(|normal| normal.double_sided),
    );
    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);

    let Some(normal) = normal else {
        bind_gl_debug_normal_map(state, &program, None, 1.0);
        return;
    };
    bind_gl_debug_normal_map(state, &program, normal_map.as_deref(), normal.normal_scale);
}

fn draw_gl_normal_mesh_material(
    state: &mut GlRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    let program = get_gl_scene3d_runtime(state).active_mesh_program.clone();
    let Some(program) = program else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

// Registers the built-in Normal renderer for NormalMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with NormalMaterials draw.
pub fn register_gl_normal_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        NORMAL_MATERIAL_KIND.to_string(),
        &GL_NORMAL_MESH_MATERIAL_RENDERER,
    );
}
