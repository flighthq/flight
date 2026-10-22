use flight_materials::NORMAL_MATERIAL_KIND;
use flight_materials::contract::create_normal_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn make_proxy() -> flight_render::Scene3DRenderProxy {
    let geometry = create_box_mesh_geometry(None, None, None);
    return make_test_proxy_for(&geometry, share_test_material(create_normal_material()));
}

mod register_wgpu_normal_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_normal_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_normal_material(&mut test.state);
        assert!(is_same_renderer(
            get_wgpu_mesh_material_renderer(&test.state, NORMAL_MATERIAL_KIND),
            &WGPU_NORMAL_MESH_MATERIAL_RENDERER
        ));
    }
}

mod wgpu_normal_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_the_normal_pipeline_and_writes_the_frame_and_material_uniforms() {
        let mut test = make_wgpu_scene3d_state(None);
        let material = {
            let mut material = create_normal_material();
            material.normal_scale = 2.0;
            material
        };
        bind_test_renderer(
            &mut test.state,
            &WGPU_NORMAL_MESH_MATERIAL_RENDERER,
            Some(&material),
        );
        assert!(test.count("createRenderPipeline") > 0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("writeBuffer") > 0);
        assert!(test.count("setBindGroup") >= 2);
        let write = test.buffer_writes().last().cloned().unwrap();
        assert_eq!(bytes_to_f32(&write.data), vec![0.0, 1.0, 2.0, 0.0]);
    }

    #[test]
    fn bind_disables_back_face_culling_for_a_double_sided_material() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut material = create_normal_material();
        material.double_sided = true;
        bind_test_renderer(
            &mut test.state,
            &WGPU_NORMAL_MESH_MATERIAL_RENDERER,
            Some(&material),
        );
        let descriptor = test.pipelines()[0].clone();
        assert_eq!(descriptor.primitive.cull_mode, None);
    }

    #[test]
    fn draw_issues_an_indexed_draw_over_the_subset_after_bind() {
        let mut test = make_wgpu_scene3d_state(None);
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            bind_test_renderer(
                &mut test.state,
                &WGPU_NORMAL_MESH_MATERIAL_RENDERER,
                Some(&*material as &dyn flight_materials::Material),
            );
        }
        (WGPU_NORMAL_MESH_MATERIAL_RENDERER.draw)(
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
        (WGPU_NORMAL_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &make_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(test.count("drawIndexed"), 0);
    }
}
