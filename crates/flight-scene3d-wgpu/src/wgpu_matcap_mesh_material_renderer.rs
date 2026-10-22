use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, MATCAP_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuMatcapDefineKey, WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy};
use crate::wgpu_matcap_prelude::ensure_wgpu_matcap_pipeline;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};

pub struct WgpuMatcapMeshMaterialRendererImpl;

impl WgpuMeshMaterialRenderer for WgpuMatcapMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let format = state.format;
        let key = WgpuMatcapDefineKey {
            has_alpha_mask: false,
            has_matcap_map: true,
            has_normal_map: false,
        };
        let pipeline = ensure_wgpu_matcap_pipeline(state, &key, format);
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

pub fn register_wgpu_matcap_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        MATCAP_MATERIAL_KIND.to_string(),
        Arc::new(WgpuMatcapMeshMaterialRendererImpl),
    );
}
