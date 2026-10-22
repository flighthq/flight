use flight_scene3d_wgpu::contract::*;

mod wgpu_mesh_fragment_tail {
    use super::*;

    #[test]
    fn declares_the_premultiply_helper_the_preludes_return_through() {
        assert!(
            WGPU_MESH_FRAGMENT_TAIL.contains("fn flightPremultipliedOutput(color : vec4f) -> vec4f")
        );
    }

    #[test]
    fn scales_rgb_by_alpha_and_leaves_alpha_itself_unchanged() {
        assert!(WGPU_MESH_FRAGMENT_TAIL.contains("vec4f(color.rgb * color.a, color.a)"));
    }
}
