use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render_wgpu::WgpuRenderState;

use crate::types::{WgpuMeshMaterialRenderer, WgpuPbrDefineKey, WgpuScene3DRenderProxy};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform};
use crate::wgpu_pbr_prelude::ensure_wgpu_pbr_pipeline;

pub struct WgpuSpecularGlossinessPbrMeshMaterialRendererImpl;

impl WgpuMeshMaterialRenderer for WgpuSpecularGlossinessPbrMeshMaterialRendererImpl {
    fn bind(
        &self,
        state: &WgpuRenderState,
        material: &dyn Material3D,
        lights: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let format = state.format;
        let key = WgpuPbrDefineKey {
            alpha_mask_enabled: false,
            anisotropy_enabled: false,
            clearcoat_enabled: false,
            double_sided: false,
            has_alpha_map: false,
            has_base_color_map: false,
            has_color_adjustment: false,
            has_color_matrix: false,
            has_emissive_map: false,
            has_metallic_roughness_map: false,
            has_normal_map: false,
            has_occlusion_map: false,
            iridescence_enabled: false,
            sheen_enabled: false,
            specular_enabled: true,
            subsurface_enabled: false,
            transmission_enabled: false,
        };
        let pipeline = ensure_wgpu_pbr_pipeline(state, &key, format);
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

pub fn register_wgpu_specular_glossiness_pbr_material(state: &WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string(),
        Arc::new(WgpuSpecularGlossinessPbrMeshMaterialRendererImpl),
    );
}
