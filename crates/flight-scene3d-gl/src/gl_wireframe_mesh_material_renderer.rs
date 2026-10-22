// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, MaterialAlphaMode, WIREFRAME_MATERIAL_KIND, WireframeMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState};
use glow::HasContext;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection, upload_gl_mesh_draw_alpha};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_wireframe_prelude::ensure_gl_wireframe_program;
use crate::gl_wireframe_upload::ensure_gl_wireframe_upload;
use crate::types::GlMeshProgramRef;

// The built-in Wireframe forward renderer (GlMeshMaterialRenderer for WireframeMaterialKind). Draws the
// mesh's triangle edges as GL lines in a single flat linear color. Unlike the triangle families it does
// not use draw_gl_mesh_subset: draw binds the wireframe line-index VAO (see gl_wireframe_upload) and
// issues a LINES draw over the subset's derived line range. `thickness` > 1 is not honored — WebGL2
// fixes line width at 1px on virtually all drivers; the field is documented as best-effort and ignored
// here. Lights are ignored. See register_gl_wireframe_material to install it.
pub static GL_WIREFRAME_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_wireframe_mesh_material,
    draw: draw_gl_wireframe_mesh_material,
};

// Registers the built-in Wireframe renderer for WireframeMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene3D so meshes with
// WireframeMaterials draw.
pub fn register_gl_wireframe_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        WIREFRAME_MATERIAL_KIND.to_string(),
        &GL_WIREFRAME_MESH_MATERIAL_RENDERER,
    );
}

fn bind_gl_wireframe_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    _lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    let gl = state.gl.clone();
    let wireframe = material.and_then(|material| material.as_any().downcast_ref::<WireframeMaterial>());
    let alpha_mask_enabled = wireframe.is_some_and(|wireframe| wireframe.alpha_mode == MaterialAlphaMode::Mask);
    let program = ensure_gl_wireframe_program(state, Some(alpha_mask_enabled));
    let family: GlMeshProgramRef = program.clone();
    // double_sided = true: lines have no winding, so back-face culling must be off.
    begin_gl_mesh_draw(state, &family, true);
    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);

    let Some(wireframe) = wireframe else {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe { gl.uniform_4_f32(program.loc_color.as_ref(), 1.0, 1.0, 1.0, 1.0) };
        return;
    };
    let mut scratch_rgba = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, wireframe.color);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_4_f32(
            program.loc_color.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
            scratch_rgba.a,
        );
        if alpha_mask_enabled {
            gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), wireframe.alpha_cutoff);
        }
    }
}

fn draw_gl_wireframe_mesh_material(state: &mut GlRenderState, proxy: &Scene3DRenderProxy, geometry: &MeshGeometry) {
    let gl = state.gl.clone();
    let program = get_gl_scene3d_runtime(state).active_mesh_program.clone();
    let Some(program) = program else {
        return;
    };
    let program = program.mesh_program();

    // SAFETY: the program is bound on the owning GL thread.
    unsafe { gl.uniform_matrix_4_f32_slice(program.loc_model.as_ref(), false, &proxy.world_matrix.m) };
    // This family bypasses draw_gl_mesh_subset, so it uploads the per-draw object alpha itself.
    {
        let material = proxy.material.read().unwrap();
        upload_gl_mesh_draw_alpha(&gl, program, proxy.alpha.unwrap_or(1.0), Some(&*material));
    }

    // Same opt-in gate as draw_gl_mesh_subset: no capability, no palette bind and no HAS_SKIN variant.
    let skin_feature = get_gl_scene3d_runtime(state).mesh_skin_feature;
    let gpu_skinned = skin_feature.is_some_and(|feature| (feature.bind_mesh_skin_palette)(state, program, proxy));
    let upload = ensure_gl_wireframe_upload(state, geometry, Some(gpu_skinned));
    let subset = proxy.subset;
    // Each triangle index contributes two line indices, so the subset's line range is its triangle range
    // scaled by 2.
    let element_size = if upload.index_type == glow::UNSIGNED_INT { 4 } else { 2 };
    // SAFETY: the draw runs on the owning GL thread against the VAO the upload left bound.
    unsafe {
        gl.draw_elements(
            glow::LINES,
            (subset.index_count * 2) as i32,
            upload.index_type,
            (subset.index_offset * 2 * element_size) as i32,
        );
    }
}
