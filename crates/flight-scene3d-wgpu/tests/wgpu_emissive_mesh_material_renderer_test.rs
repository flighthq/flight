use flight_materials::EMISSIVE_MATERIAL_KIND;
use flight_materials::contract::create_emissive_material;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_wgpu::*;

use crate::support::*;

mod register_wgpu_emissive_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_emissive_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_emissive_material(&mut test.state);
        assert!(is_same_renderer(
            get_wgpu_mesh_material_renderer(&test.state, EMISSIVE_MATERIAL_KIND),
            &WGPU_EMISSIVE_MESH_MATERIAL_RENDERER
        ));
    }
}

mod wgpu_emissive_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_uploads_the_emissive_color_and_issues_frame_and_material_binds() {
        let mut test = make_wgpu_scene3d_state(None);
        let material = {
            let mut material = create_emissive_material();
            material.emissive_strength = 3.0;
            material
        };
        bind_test_renderer(
            &mut test.state,
            &WGPU_EMISSIVE_MESH_MATERIAL_RENDERER,
            Some(&material),
        );
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn draw_issues_an_indexed_draw_over_the_subset_after_bind() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let material = create_emissive_material();
        bind_test_renderer(
            &mut test.state,
            &WGPU_EMISSIVE_MESH_MATERIAL_RENDERER,
            Some(&material),
        );
        let proxy = make_test_proxy_for(&geometry, share_test_material(material));
        (WGPU_EMISSIVE_MESH_MATERIAL_RENDERER.draw)(&mut test.state, &proxy, &geometry);
        assert!(test.count("drawIndexed") > 0);
    }
}
