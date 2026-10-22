use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, EMISSIVE_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy, WgpuUnlitDefineKey};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};
use crate::wgpu_unlit_prelude::{bind_wgpu_unlit_surface, ensure_wgpu_unlit_pipeline};

pub struct WgpuEmissiveMeshMaterialRendererImpl;

impl WgpuMeshMaterialRenderer for WgpuEmissiveMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let format = state.format;
        let key = WgpuUnlitDefineKey {
            alpha_mask_enabled: false,
            double_sided: false,
            has_color_map: false,
        };
        let pipeline = ensure_wgpu_unlit_pipeline(state, &key, format);
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

pub fn register_wgpu_emissive_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        EMISSIVE_MATERIAL_KIND.to_string(),
        Arc::new(WgpuEmissiveMeshMaterialRendererImpl),
    );
}
