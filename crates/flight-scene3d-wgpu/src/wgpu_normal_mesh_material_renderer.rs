use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, NORMAL_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuDebugDefineKey, WgpuDebugMode, WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy};
use crate::wgpu_debug_prelude::{bind_wgpu_debug_surface, ensure_wgpu_debug_pipeline};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};

pub struct WgpuNormalMeshMaterialRendererImpl;

impl WgpuMeshMaterialRenderer for WgpuNormalMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let format = state.format;
        let key = WgpuDebugDefineKey {
            has_normal_map: false,
            mode: WgpuDebugMode::Normal,
        };
        let pipeline = ensure_wgpu_debug_pipeline(state, &key, format, false);
        write_wgpu_frame_uniform(state, camera, lights);
        let group = bind_wgpu_debug_surface(state, &pipeline, 0, 0.0, 1.0, 1.0);
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

pub fn register_wgpu_normal_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        NORMAL_MATERIAL_KIND.to_string(),
        Arc::new(WgpuNormalMeshMaterialRendererImpl),
    );
}
