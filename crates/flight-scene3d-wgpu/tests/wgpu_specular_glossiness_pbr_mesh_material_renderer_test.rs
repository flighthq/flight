use std::sync::{Arc, RwLock};

use flight_materials::SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND;
use flight_materials::contract::create_specular_glossiness_pbr_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn make_proxy() -> flight_render::Scene3DRenderProxy {
    let mut material = create_specular_glossiness_pbr_material();
    material.glossiness = 0.7;
    let geometry = create_box_mesh_geometry(None, None, None);
    return make_test_proxy_for(&geometry, Arc::new(RwLock::new(material)));
}

fn bind(test: &mut WgpuScene3DTestState) {
    let material = create_specular_glossiness_pbr_material();
    (WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.bind)(
        &mut test.state,
        Some(&material),
        &make_test_lights(),
        &make_test_camera(),
    );
}

mod register_wgpu_specular_glossiness_pbr_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_specular_glossiness_pbr_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_specular_glossiness_pbr_material(&mut test.state);
        assert!(
            get_wgpu_mesh_material_renderer(&test.state, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND)
                .is_some_and(|renderer| std::ptr::eq(
                    renderer,
                    &WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER
                ))
        );
    }
}

mod wgpu_specular_glossiness_pbr_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_pipeline_and_binds_frame_and_material_groups_and_uploads_uniforms() {
        let mut test = make_wgpu_scene3d_state(None);
        bind(&mut test);
        assert!(test.count("createRenderPipeline") > 0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("setBindGroup") >= 2);
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn drives_the_base_pbr_program_with_no_extension_flag_cpu_spec_gloss_conversion() {
        let mut test = make_wgpu_scene3d_state(None);
        bind(&mut test);
        let code = test.shader_sources()[0].clone();
        assert!(code.contains("const CLEARCOAT : bool = false;"));
        assert!(code.contains("const SHEEN : bool = false;"));
        assert!(code.contains("const SPECULAR_EXT : bool = false;"));
        assert!(code.contains("const TRANSMISSION : bool = false;"));
    }

    #[test]
    fn draw_uploads_geometry_and_issues_an_indexed_draw_over_the_subset_range() {
        let mut test = make_wgpu_scene3d_state(None);
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            (WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.bind)(
                &mut test.state,
                Some(&*material as &dyn flight_materials::Material),
                &make_test_lights(),
                &make_test_camera(),
            );
        }
        (WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &proxy,
            &create_box_mesh_geometry(None, None, None),
        );
        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, proxy.subset.index_count);
        assert_eq!(draws[0].first_index, proxy.subset.index_offset);
        // glossiness 0.7 converts to roughness 0.3 in the uploaded block.
        let block = get_wgpu_pbr_material_scratch(&mut test.state);
        assert!((block[9] - 0.3).abs() < 1e-6);
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        (WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &make_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(test.count("drawIndexed"), 0);
    }
}
