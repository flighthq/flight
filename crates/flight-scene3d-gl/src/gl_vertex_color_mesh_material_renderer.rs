// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use std::rc::Rc;
use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, MaterialAlphaMode, VERTEX_COLOR_MATERIAL_KIND, VertexColorMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState};
use glow::HasContext;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_unlit_prelude::{bind_gl_unlit_surface, ensure_gl_unlit_program};
use crate::types::{GlMeshProgramRef, GlUnlitDefineKey};

// The built-in VertexColor forward renderer (GlMeshMaterialRenderer for VertexColorMaterialKind).
// Lighting-independent: the unlit shader's VERTEX_COLOR variant multiplies the mesh's interpolated
// color0 attribute by the linear tint. Geometry without a color0 attribute leaves the attribute
// unbound (its default), so a tinted black surface results — author color0 (or import it via glTF) to
// drive this material. Lights are ignored. See register_gl_vertex_color_material to install it.
pub static GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_vertex_color_mesh_material,
    draw: draw_gl_vertex_color_mesh_material,
};

fn bind_gl_vertex_color_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    _lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let gl = state.gl.clone();
    let vertex_color =
        material.and_then(|material| material.as_any().downcast_ref::<VertexColorMaterial>());
    let program = ensure_gl_unlit_program(state, &define_key_for_material(vertex_color));
    let family: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(
        state,
        &family,
        vertex_color.is_some_and(|vertex_color| vertex_color.double_sided),
    );
    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);

    // Default the color0 generic vertex attribute to opaque white so a mesh WITHOUT a color0 attribute
    // renders the tint alone (matching the wgpu path) instead of multiplying by the (0,0,0,1) default,
    // which would render black. A mesh that DOES carry color0 enables the array and overrides this.
    // SAFETY: generic attribute state runs on the owning GL thread.
    unsafe { gl.vertex_attrib_4_f32(4, 1.0, 1.0, 1.0, 1.0) };

    let Some(vertex_color) = vertex_color else {
        bind_gl_unlit_surface(state, &program, &white(), 1.0, None, 0.5);
        return;
    };
    let mut scratch_rgba = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, vertex_color.tint);
    bind_gl_unlit_surface(state, &program, &scratch_rgba, 1.0, None, vertex_color.alpha_cutoff);
}

fn define_key_for_material(material: Option<&VertexColorMaterial>) -> GlUnlitDefineKey {
    return GlUnlitDefineKey {
        alpha_mask_enabled: material.is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        has_color_map: false,
        has_instances: None,
        has_skin: None,
        // VertexColor samples no map, so the uv transform never applies.
        has_uv_transform: false,
        vertex_color: true,
    };
}

fn draw_gl_vertex_color_mesh_material(
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

// Registers the built-in VertexColor renderer for VertexColorMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene3D so meshes with
// VertexColorMaterials draw.
pub fn register_gl_vertex_color_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        VERTEX_COLOR_MATERIAL_KIND.to_string(),
        &GL_VERTEX_COLOR_MESH_MATERIAL_RENDERER,
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
