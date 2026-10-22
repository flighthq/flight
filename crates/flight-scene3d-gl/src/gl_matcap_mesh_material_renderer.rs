// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{MATCAP_MATERIAL_KIND, MatcapMaterial, Material3D, MaterialAlphaMode};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState, resolve_gl_texture};
use glow::HasContext;

use crate::gl_matcap_prelude::{bind_gl_matcap_surface, ensure_gl_matcap_program};
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMatcapDefineKey, GlMeshProgramRef};

// The built-in Matcap forward renderer (GlMeshMaterialRenderer for MatcapMaterialKind). Lighting-
// independent material-capture shading: bind selects the matcap variant for the material's matcap
// texture / alpha mode, uploads the camera view-projection plus the camera view matrix (u_view, which
// the vertex stage uses to rotate the world-space normal into view space), and the linear tint; draw
// issues the indexed draw. Lights are ignored — the matcap texture is the prebaked lighting. See
// register_gl_matcap_material to install it.
pub static GL_MATCAP_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_matcap_mesh_material,
    draw: draw_gl_matcap_mesh_material,
};

// Registers the built-in Matcap renderer for MatcapMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with MatcapMaterials draw.
pub fn register_gl_matcap_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        MATCAP_MATERIAL_KIND.to_string(),
        &GL_MATCAP_MESH_MATERIAL_RENDERER,
    );
}

fn bind_gl_matcap_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    _lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    let gl = state.gl.clone();
    let matcap = material.and_then(|material| material.as_any().downcast_ref::<MatcapMaterial>());
    let key = define_key_for_material(state, matcap);
    let program = ensure_gl_matcap_program(state, &key);
    let family: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(state, &family, matcap.is_some_and(|matcap| matcap.double_sided));
    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    // u_view rotates the world-space normal into view space for the matcap lookup.
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_matrix_4_f32_slice(program.loc_view.as_ref(), false, &camera.view.read().unwrap().m);
    }

    let Some(matcap) = matcap else {
        bind_gl_matcap_surface(state, &program, &white(), None, 0.5);
        return;
    };
    let mut scratch_rgba = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, matcap.tint);
    let matcap_map = matcap.matcap.as_ref().map(|map| map.read().unwrap());
    bind_gl_matcap_surface(
        state,
        &program,
        &scratch_rgba,
        matcap_map.as_deref(),
        matcap.alpha_cutoff,
    );
}

fn define_key_for_material(state: &mut GlRenderState, material: Option<&MatcapMaterial>) -> GlMatcapDefineKey {
    let matcap = material
        .and_then(|material| material.matcap.as_ref())
        .map(|map| map.read().unwrap());
    return GlMatcapDefineKey {
        alpha_mask_enabled: material.is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        has_instances: None,
        has_matcap: matcap
            .as_deref()
            .is_some_and(|map| resolve_gl_texture(state, map, None, None).is_some()),
        has_skin: None,
    };
}

fn draw_gl_matcap_mesh_material(state: &mut GlRenderState, proxy: &Scene3DRenderProxy, geometry: &MeshGeometry) {
    let program = get_gl_scene3d_runtime(state).active_mesh_program.clone();
    let Some(program) = program else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

fn white() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 1.0;
    color.g = 1.0;
    color.b = 1.0;
    color.a = 1.0;
    return color;
}
