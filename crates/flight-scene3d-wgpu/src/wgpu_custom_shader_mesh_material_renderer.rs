use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, CUSTOM_SHADER_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy};
use crate::wgpu_custom_material_abi::resolve_wgpu_custom_material_pipeline;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};

pub struct WgpuCustomShaderMeshMaterialRendererImpl;

pub fn register_wgpu_custom_shader_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        CUSTOM_SHADER_MATERIAL_KIND.to_string(),
        Arc::new(WgpuCustomShaderMeshMaterialRendererImpl),
    );
}

impl WgpuMeshMaterialRenderer for WgpuCustomShaderMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        write_wgpu_frame_uniform(state, camera, lights);
        if let Some(pipeline) = resolve_wgpu_custom_material_pipeline(state, material) {
            begin_wgpu_mesh_draw(state, &pipeline);
        }
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
