use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_scene3d_wgpu::*;

use crate::support::*;

mod register_wgpu_standard_pbr_material {
    use super::*;

    #[test]
    fn registers_the_standard_pbr_renderer_for_standard_pbr_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        assert!(get_wgpu_mesh_material_renderer(&test.state, STANDARD_PBR_MATERIAL_KIND).is_none());
        register_wgpu_standard_pbr_material(&mut test.state);
        assert!(get_wgpu_mesh_material_renderer(&test.state, STANDARD_PBR_MATERIAL_KIND)
            .is_some_and(|renderer| std::ptr::eq(renderer, &WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER)));
    }
}
