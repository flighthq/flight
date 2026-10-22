// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the renderer reads any material through `&dyn Material`
//! The built-in VertexColor forward renderer (TS `wgpuVertexColorMeshMaterialRenderer.ts`): the material's
//! linear tint through the shared unlit pipeline. The canonical 48-byte vertex has no color0 slot on
//! wgpu, so the per-vertex color is not multiplied in yet; the tint alone drives the surface.

use std::sync::LazyLock;

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_entity::Ref;
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{
    Material, MaterialAlphaMode, VERTEX_COLOR_MATERIAL_KIND, VertexColorMaterial,
};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    set_wgpu_render_pass_bind_group,
};

use crate::types::*;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform,
};
use crate::wgpu_unlit_prelude::{bind_wgpu_unlit_surface, ensure_wgpu_unlit_pipeline};

// The identity the material-less fallback bind caches its binding under (TS: a module-level `{}`
// object). A real entity, so its key is a numeric entity id (D12/D15): unique to this renderer and
// never reused, so it cannot alias a material's binding or another renderer's fallback.
static FALLBACK_MATERIAL: LazyLock<VertexColorMaterial> =
    LazyLock::new(flight_materials::contract::create_vertex_color_material);

/// The VertexColor mesh-material renderer for `VERTEX_COLOR_MATERIAL_KIND` (TS
/// `wgpuVertexColorMeshMaterialRenderer`).
pub static WGPU_VERTEX_COLOR_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer =
    WgpuMeshMaterialRenderer {
        bind: bind_vertex_color_material,
        draw: draw_vertex_color_material,
    };

fn bind_vertex_color_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let vertex_color =
        material.and_then(|material| material.as_any().downcast_ref::<VertexColorMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline =
        ensure_wgpu_unlit_pipeline(state, &define_key_for_material(vertex_color), format);
    write_wgpu_frame_uniform(state, camera, lights);

    let group = match vertex_color {
        None => bind_wgpu_unlit_surface(
            state,
            &pipeline,
            flight_entity::get_entity_id(&*FALLBACK_MATERIAL),
            &white_linear_color(),
            1.0,
            0.5,
            None,
        ),
        Some(vertex_color) => {
            let mut color = allocate_linear_color();
            unpack_color_to_linear(&mut color, vertex_color.tint);
            // VertexColor carries no map; color0 is the absent vertex attribute, so the placeholder
            // satisfies the color slot.
            bind_wgpu_unlit_surface(
                state,
                &pipeline,
                get_entity_id(vertex_color),
                &color,
                1.0,
                vertex_color.alpha_cutoff,
                None,
            )
        }
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

fn define_key_for_material(material: Option<&VertexColorMaterial>) -> WgpuUnlitDefineKey {
    return WgpuUnlitDefineKey {
        alpha_mask_enabled: material
            .is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|material| material.double_sided),
        has_color_map: false,
    };
}

fn draw_vertex_color_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// Registers the VertexColor renderer (TS `registerWgpuVertexColorMaterial`).
pub fn register_wgpu_vertex_color_material(state: &mut WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        VERTEX_COLOR_MATERIAL_KIND.to_string(),
        &WGPU_VERTEX_COLOR_MESH_MATERIAL_RENDERER,
    );
}

fn white_linear_color() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 1.0;
    color.g = 1.0;
    color.b = 1.0;
    color.a = 1.0;
    return color;
}
