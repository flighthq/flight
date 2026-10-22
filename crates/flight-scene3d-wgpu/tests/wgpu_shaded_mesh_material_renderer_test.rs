use flight_materials::{Material, MaterialAlphaMode};
use flight_scene3d_wgpu::contract::*;
use flight_shading::{SHADED_MATERIAL_KIND, create_shaded_material};

use crate::support::*;

mod get_wgpu_shaded_base_flags {
    use super::*;

    #[test]
    fn resolves_the_base_pipeline_flags_from_a_material() {
        let mut material = create_shaded_material();
        material.alpha_mode = MaterialAlphaMode::Mask;
        material.double_sided = true;
        assert_eq!(
            get_wgpu_shaded_base_flags(&material),
            WgpuShadedBaseFlags {
                alpha_mask_enabled: true,
                double_sided: true,
                has_diffuse_map: false,
                has_normal_map: false,
                has_specular_map: false,
            }
        );
    }
}

mod register_wgpu_shaded_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_shaded_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_shaded_material(&mut test.state);
        assert!(get_wgpu_mesh_material_renderer(&test.state, SHADED_MATERIAL_KIND)
            .is_some_and(|renderer| std::ptr::eq(renderer, &WGPU_SHADED_MESH_MATERIAL_RENDERER)));
    }
}

mod wgpu_shaded_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_compiles_a_shaded_module_and_binds_frame_material_and_sample_groups() {
        let mut test = make_wgpu_scene3d_state(None);
        let material = create_shaded_material();
        let mut lights = make_test_lights();
        lights.ambient_count = 0;
        lights.directional_count = 0;
        lights.data.fill(0.0);
        (WGPU_SHADED_MESH_MATERIAL_RENDERER.bind)(
            &mut test.state,
            Some(&material as &dyn Material),
            &lights,
            &make_test_camera(),
        );
        let sources = test.shader_sources();
        assert!(!sources.is_empty());
        assert!(sources[0].contains("struct ClassicMaterial"));
        assert!(!sources[0].contains("modifierData"));
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("setBindGroup") >= 3);
    }
}
