use flight_materials::contract::create_lambert_material;
use flight_materials::{Material, LAMBERT_MATERIAL_KIND};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

mod register_wgpu_lambert_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_lambert_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_lambert_material(&mut test.state);
        assert!(get_wgpu_mesh_material_renderer(&test.state, LAMBERT_MATERIAL_KIND)
            .is_some_and(|renderer| std::ptr::eq(renderer, &WGPU_LAMBERT_MESH_MATERIAL_RENDERER)));
    }
}

mod wgpu_lambert_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_pipeline_and_binds_frame_and_material_groups_and_uploads_uniforms() {
        let mut test = make_wgpu_scene3d_state(None);
        let material = create_lambert_material();
        (WGPU_LAMBERT_MESH_MATERIAL_RENDERER.bind)(
            &mut test.state,
            Some(&material as &dyn Material),
            &make_test_lights(),
            &make_test_camera(),
        );

        assert!(test.count("createRenderPipeline") > 0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("setBindGroup") >= 2);
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn draw_uploads_geometry_and_issues_an_indexed_draw_over_the_subset_range() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let proxy = make_test_proxy_for(&geometry, share_test_material(create_lambert_material()));
        {
            let material = proxy.material.read().unwrap();
            (WGPU_LAMBERT_MESH_MATERIAL_RENDERER.bind)(
                &mut test.state,
                Some(&*material as &dyn Material),
                &make_test_lights(),
                &make_test_camera(),
            );
        }
        (WGPU_LAMBERT_MESH_MATERIAL_RENDERER.draw)(&mut test.state, &proxy, &geometry);

        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, proxy.subset.index_count);
        assert_eq!(draws[0].first_index, proxy.subset.index_offset);
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let proxy = make_test_proxy_for(&geometry, share_test_material(create_lambert_material()));
        (WGPU_LAMBERT_MESH_MATERIAL_RENDERER.draw)(&mut test.state, &proxy, &geometry);
        assert_eq!(test.count("drawIndexed"), 0);
    }
}
