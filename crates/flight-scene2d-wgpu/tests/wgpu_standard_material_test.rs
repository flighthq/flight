use flight_materials::STANDARD_MATERIAL_KIND;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

mod register_wgpu_standard_material {
    use super::*;

    #[test]
    fn registers_the_default_renderer_under_standard_material_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_standard_material(&mut state);
        let renderer =
            get_wgpu_quad_material_renderer(&state, &STANDARD_MATERIAL_KIND.to_string()).unwrap();
        assert_eq!(
            renderer.instance_float_count,
            STANDARD_WGPU_QUAD_MATERIAL_RENDERER.instance_float_count
        );
        assert!(std::ptr::fn_addr_eq(
            renderer.get_shader_module,
            STANDARD_WGPU_QUAD_MATERIAL_RENDERER.get_shader_module
        ));
    }
}

mod standard_wgpu_quad_material_renderer {
    use super::*;

    #[test]
    fn declares_no_per_instance_float_data() {
        assert_eq!(STANDARD_WGPU_QUAD_MATERIAL_RENDERER.instance_float_count, 0);
        assert!(STANDARD_WGPU_QUAD_MATERIAL_RENDERER.pack_instance.is_none());
    }

    #[test]
    fn compiles_and_caches_its_module_once_per_device() {
        let mut state = create_wgpu_render_state_for_test(None);
        let first = (STANDARD_WGPU_QUAD_MATERIAL_RENDERER.get_shader_module)(&mut state);
        let second = (STANDARD_WGPU_QUAD_MATERIAL_RENDERER.get_shader_module)(&mut state);
        assert_eq!(first, second);
    }
}
