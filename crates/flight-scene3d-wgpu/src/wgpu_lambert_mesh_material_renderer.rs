use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, LAMBERT_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuClassicDefineKey, WgpuClassicLightingModel, WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy};
use crate::wgpu_classic_prelude::ensure_wgpu_classic_pipeline;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};

pub struct WgpuLambertMeshMaterialRendererImpl;

impl WgpuMeshMaterialRenderer for WgpuLambertMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let format = state.format;
        let key = WgpuClassicDefineKey {
            alpha_mask_enabled: false,
            double_sided: false,
            has_alpha_map: false,
            has_color_adjustment: false,
            has_color_matrix: false,
            has_diffuse_map: false,
            has_normal_map: false,
            has_specular_map: false,
            lighting_model: WgpuClassicLightingModel::Lambert,
        };
        let pipeline = ensure_wgpu_classic_pipeline(state, &key, format);
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

pub fn register_wgpu_lambert_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        LAMBERT_MATERIAL_KIND.to_string(),
        Arc::new(WgpuLambertMeshMaterialRendererImpl),
    );
}
