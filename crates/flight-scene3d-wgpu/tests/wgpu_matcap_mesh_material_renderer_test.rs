use flight_materials::MATCAP_MATERIAL_KIND;
use flight_materials::contract::create_matcap_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_wgpu::*;

use crate::support::*;

fn make_proxy() -> flight_render::Scene3DRenderProxy {
    let geometry = create_box_mesh_geometry(None, None, None);
    return make_test_proxy_for(&geometry, share_test_material(create_matcap_material()));
}

mod register_wgpu_matcap_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_matcap_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_matcap_material(&mut test.state);
        assert!(is_same_renderer(
            get_wgpu_mesh_material_renderer(&test.state, MATCAP_MATERIAL_KIND),
            &WGPU_MATCAP_MESH_MATERIAL_RENDERER
        ));
    }
}

mod wgpu_matcap_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_pipeline_and_binds_the_frame_and_material_groups() {
        let mut test = make_wgpu_scene3d_state(None);
        let material = create_matcap_material();
        bind_test_renderer(
            &mut test.state,
            &WGPU_MATCAP_MESH_MATERIAL_RENDERER,
            Some(&material),
        );
        assert!(test.count("createRenderPipeline") > 0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("writeBuffer") > 0);
        assert!(test.count("setBindGroup") >= 2);
    }

    #[test]
    fn draw_issues_an_indexed_draw_over_the_subset_after_bind() {
        let mut test = make_wgpu_scene3d_state(None);
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            bind_test_renderer(
                &mut test.state,
                &WGPU_MATCAP_MESH_MATERIAL_RENDERER,
                Some(&*material as &dyn flight_materials::Material),
            );
        }
        (WGPU_MATCAP_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &proxy,
            &create_box_mesh_geometry(None, None, None),
        );
        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, proxy.subset.index_count);
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        (WGPU_MATCAP_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &make_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(test.count("drawIndexed"), 0);
    }
}
