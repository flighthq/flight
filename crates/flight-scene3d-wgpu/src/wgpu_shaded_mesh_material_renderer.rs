use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, BLINN_PHONG_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuMeshMaterialRenderer, WgpuScene3DRenderProxy, WgpuShadedDefineKey};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};
use crate::wgpu_shaded_prelude::ensure_wgpu_shaded_pipeline;

pub struct WgpuShadedFlags {
    pub alpha_mask_enabled: bool,
    pub double_sided: bool,
    pub has_diffuse_map: bool,
    pub has_normal_map: bool,
    pub has_specular_map: bool,
}

pub fn get_wgpu_shaded_base_flags(_material: &dyn Material3D) -> WgpuShadedFlags {
    return WgpuShadedFlags {
        alpha_mask_enabled: false,
        double_sided: false,
        has_diffuse_map: false,
        has_normal_map: false,
        has_specular_map: false,
    };
}

pub struct WgpuShadedMeshMaterialRendererImpl;

impl WgpuMeshMaterialRenderer for WgpuShadedMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let format = state.format;
        let key = WgpuShadedDefineKey {
            alpha_mask_enabled: false,
            double_sided: false,
            has_color_adjustment: false,
            has_color_matrix: false,
            has_diffuse_map: false,
            has_normal_map: false,
            has_specular_map: false,
        };
        let pipeline = ensure_wgpu_shaded_pipeline(state, &key, format, "");
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

pub fn register_wgpu_shaded_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        "shaded".to_string(),
        Arc::new(WgpuShadedMeshMaterialRendererImpl),
    );
}
