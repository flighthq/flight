use flight_materials::TOON_MATERIAL_KIND;
use flight_materials::contract::create_toon_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_wgpu::*;

use crate::support::*;

fn make_proxy() -> flight_render::Scene3DRenderProxy {
    let geometry = create_box_mesh_geometry(None, None, None);
    return make_test_proxy_for(&geometry, share_test_material(create_toon_material()));
}

fn bind_toon(test: &mut WgpuScene3DTestState, material: &dyn flight_materials::Material) {
    (WGPU_TOON_MESH_MATERIAL_RENDERER.bind)(
        &mut test.state,
        Some(material),
        &make_test_lights(),
        &make_test_camera(),
    );
}

mod register_wgpu_toon_material {
    use super::*;

    #[test]
    fn installs_the_toon_renderer_for_toon_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_toon_material(&mut test.state);
        assert!(is_same_renderer(
            get_wgpu_mesh_material_renderer(&test.state, TOON_MATERIAL_KIND),
            &WGPU_TOON_MESH_MATERIAL_RENDERER
        ));
    }
}

mod wgpu_toon_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_pipeline_and_binds_frame_and_material_groups_and_uploads_uniforms() {
        let mut test = make_wgpu_scene3d_state(None);
        bind_toon(&mut test, &create_toon_material());
        assert!(test.count("createRenderPipeline") > 0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("setBindGroup") >= 2);
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn bind_compiles_a_cull_none_pipeline_for_a_double_sided_material() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut material = create_toon_material();
        material.double_sided = true;
        bind_toon(&mut test, &material);
        assert_eq!(test.pipelines()[0].primitive.cull_mode, None);
    }

    #[test]
    fn draw_uploads_geometry_and_issues_an_indexed_draw_over_the_subset_range() {
        let mut test = make_wgpu_scene3d_state(None);
        let proxy = make_proxy();
        let geometry = create_box_mesh_geometry(None, None, None);
        {
            let material = proxy.material.read().unwrap();
            bind_toon(&mut test, &*material as &dyn flight_materials::Material);
        }
        (WGPU_TOON_MESH_MATERIAL_RENDERER.draw)(&mut test.state, &proxy, &geometry);

        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, proxy.subset.index_count);
        assert_eq!(draws[0].first_index, proxy.subset.index_offset);
        assert!(test.count("setIndexBuffer") > 0);
        assert!(test.count("setVertexBuffer") > 0);
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        (WGPU_TOON_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &make_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(test.count("drawIndexed"), 0);
    }
}
