// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, MaterialAlphaMode, UNLIT_MATERIAL_KIND, UnlitMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState, resolve_gl_texture};
use std::rc::Rc;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, bind_gl_uv_transform, draw_gl_mesh_subset, has_gl_uv_transform,
    set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_unlit_prelude::{bind_gl_unlit_surface, ensure_gl_unlit_program};
use crate::types::{GlMeshProgramRef, GlUnlitDefineKey};

// The built-in Unlit forward renderer (GlMeshMaterialRenderer for UnlitMaterialKind). Lighting-
// independent flat color: bind selects the unlit variant for the material's base-color map / alpha
// mode, uploads the camera view-projection and the linear base color, and draw issues the indexed
// draw. Lights are ignored. See register_gl_unlit_material to install it.
pub static GL_UNLIT_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_unlit_mesh_material,
    draw: draw_gl_unlit_mesh_material,
};

fn bind_gl_unlit_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    _lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let gl = state.gl.clone();
    let unlit = material.and_then(|material| material.as_any().downcast_ref::<UnlitMaterial>());
    let key = define_key_for_material(state, unlit);
    let program = ensure_gl_unlit_program(state, &key);
    let family: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(
        state,
        &family,
        unlit.is_some_and(|unlit| unlit.double_sided),
    );
    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);

    let Some(unlit) = unlit else {
        bind_gl_unlit_surface(state, &program, &white(), 1.0, None, 0.5);
        return;
    };
    let mut scratch_rgba = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, unlit.base_color);
    let color_map = unlit.base_color_map.as_ref().map(|map| map.read().unwrap());
    bind_gl_unlit_surface(
        state,
        &program,
        &scratch_rgba,
        1.0,
        color_map.as_deref(),
        unlit.alpha_cutoff,
    );
    bind_gl_uv_transform(&gl, &program, color_map.as_deref().map(|map| map as _));
}

fn define_key_for_material(
    state: &mut GlRenderState,
    material: Option<&UnlitMaterial>,
) -> GlUnlitDefineKey {
    let color_map = material.and_then(|material| material.base_color_map.as_ref());
    let color_map = color_map.map(|map| map.read().unwrap());
    let color_map_ready = color_map
        .as_deref()
        .is_some_and(|map| resolve_gl_texture(state, map, None, None).is_some());
    return GlUnlitDefineKey {
        alpha_mask_enabled: material
            .is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        has_color_map: color_map_ready,
        has_instances: None,
        has_skin: None,
        has_uv_transform: color_map_ready
            && has_gl_uv_transform(color_map.as_deref().map(|map| map as _)),
        vertex_color: false,
    };
}

fn draw_gl_unlit_mesh_material(
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

// Registers the built-in Unlit renderer for UnlitMaterialKind on this state. Opt-in (no top-level side
// effect); call once per GlRenderState before drawScene3D so meshes with UnlitMaterials draw.
pub fn register_gl_unlit_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        UNLIT_MATERIAL_KIND.to_string(),
        &GL_UNLIT_MESH_MATERIAL_RENDERER,
    );
}

fn white() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 1.0;
    color.g = 1.0;
    color.b = 1.0;
    color.a = 1.0;
    return color;
}
