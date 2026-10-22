use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, TOON_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy, WgpuToonDefineKey};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};
use crate::wgpu_toon_prelude::ensure_wgpu_toon_pipeline;

pub struct WgpuToonMeshMaterialRendererImpl;

pub fn register_wgpu_toon_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        TOON_MATERIAL_KIND.to_string(),
        Arc::new(WgpuToonMeshMaterialRendererImpl),
    );
}

impl WgpuMeshMaterialRenderer for WgpuToonMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let format = state.format;
        let key = WgpuToonDefineKey {
            has_alpha_mask: false,
            has_color_adjustment: false,
            has_color_matrix: false,
            has_diffuse_map: false,
            has_ramp: false,
            has_shadow: true,
            has_skin: false,
        };
        let pipeline = ensure_wgpu_toon_pipeline(state, &key, format);
        write_wgpu_frame_uniform(state, camera, lights);
        begin_wgpu_mesh_draw(state, &pipeline);
    }

    fn draw(
        &self,
        state: &WgpuRenderState,
        proxy: &WgpuScene3DRenderProxy,
        geometry: &MeshGeometry,
    ) {
        draw_wgpu_mesh_subset(state, proxy, geometry);
    }
}
