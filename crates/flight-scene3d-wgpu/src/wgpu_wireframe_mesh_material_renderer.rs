// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the renderer reads any material through `&dyn Material`
//! The built-in Wireframe forward renderer (TS `wgpuWireframeMeshMaterialRenderer.ts`): the triangle
//! edges as line-list primitives in one flat linear color. Unlike the triangle families it binds the
//! derived line-index buffer and draws the subset's line range itself. `thickness` above 1 is not
//! honored (WebGPU has no line-width control).

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material, MaterialAlphaMode, WIREFRAME_MATERIAL_KIND, WireframeMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, draw_wgpu_render_pass_indexed,
    get_wgpu_render_state_runtime, set_wgpu_render_pass_bind_group,
    set_wgpu_render_pass_index_buffer, set_wgpu_render_pass_vertex_buffer,
};

use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, ensure_wgpu_instance_buffer, write_wgpu_draw_uniform,
    write_wgpu_frame_uniform,
};
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;
use crate::wgpu_wireframe_prelude::{bind_wgpu_wireframe_color, ensure_wgpu_wireframe_pipeline};
use crate::wgpu_wireframe_upload::ensure_wgpu_wireframe_upload;

// The material key the material-less fallback bind caches under (TS: a module-level `{}` object).
const FALLBACK_MATERIAL_KEY: u64 = u64::MAX - 7;

/// The Wireframe mesh-material renderer for `WIREFRAME_MATERIAL_KIND` (TS
/// `wgpuWireframeMeshMaterialRenderer`).
pub static WGPU_WIREFRAME_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer =
    WgpuMeshMaterialRenderer {
        bind: bind_wireframe_material,
        draw: draw_wireframe_material,
    };

fn bind_wireframe_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let wireframe =
        material.and_then(|material| material.as_any().downcast_ref::<WireframeMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let alpha_mask_enabled =
        wireframe.is_some_and(|wireframe| wireframe.alpha_mode == MaterialAlphaMode::Mask);
    let pipeline = ensure_wgpu_wireframe_pipeline(state, format, Some(alpha_mask_enabled));
    write_wgpu_frame_uniform(state, camera, lights);

    let group = match wireframe {
        None => bind_wgpu_wireframe_color(
            state,
            &pipeline,
            FALLBACK_MATERIAL_KEY,
            &white_linear_color(),
            None,
        ),
        Some(wireframe) => {
            let mut color = allocate_linear_color();
            unpack_color_to_linear(&mut color, wireframe.color);
            bind_wgpu_wireframe_color(
                state,
                &pipeline,
                get_entity_id(wireframe),
                &color,
                Some(wireframe.alpha_cutoff),
            )
        }
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

fn draw_wireframe_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let Some(active_pipeline) = get_wgpu_scene3d_runtime(state).active_mesh_pipeline.clone() else {
        return;
    };
    let subset = proxy.subset;
    if subset.index_count == 0 {
        return;
    }
    let Some(upload) = ensure_wgpu_wireframe_upload(state, geometry, Some(active_pipeline.skinned))
    else {
        return;
    };

    let skinning = get_wgpu_scene3d_runtime(state).skinning_adapter;
    // The skinned wireframe pipeline declares both palettes beside Draw at group(1); claim them
    // before writing Draw so the palette bases ride in the same record.
    let skin_draw_bind_group = match (
        active_pipeline.skinned,
        &proxy.joint_matrices,
        &proxy.normal_matrices,
        skinning,
    ) {
        (true, Some(joint_matrices), Some(normal_matrices), Some(skinning)) => {
            let joint_matrices = joint_matrices.read().unwrap();
            let normal_matrices = normal_matrices.read().unwrap();
            Some((skinning.get_mesh_draw_bind_group)(
                state,
                &joint_matrices,
                &normal_matrices,
            ))
        }
        _ => None,
    };
    let draw_bind_group = write_wgpu_draw_uniform(state, proxy);
    let pending_draw_offset = get_wgpu_scene3d_runtime(state).pending_draw_offset;

    set_wgpu_render_pass_bind_group(
        state,
        1,
        &skin_draw_bind_group.unwrap_or(draw_bind_group),
        &[pending_draw_offset],
    );
    set_wgpu_render_pass_vertex_buffer(state, 0, &upload.vertex_buffer);
    let instance_buffer = ensure_wgpu_instance_buffer(state, None, 1);
    set_wgpu_render_pass_vertex_buffer(state, 1, &instance_buffer);
    set_wgpu_render_pass_index_buffer(state, &upload.line_index_buffer, upload.index_format);
    // Each triangle index contributes two line indices.
    draw_wgpu_render_pass_indexed(
        state,
        subset.index_count * 2,
        1,
        subset.index_offset * 2,
        0,
        0,
    );
}

/// Registers the Wireframe renderer (TS `registerWgpuWireframeMaterial`).
pub fn register_wgpu_wireframe_material(state: &mut WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        WIREFRAME_MATERIAL_KIND.to_string(),
        &WGPU_WIREFRAME_MESH_MATERIAL_RENDERER,
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
