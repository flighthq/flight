use flight_render_wgpu::*;
use flight_scene3d_wgpu::*;

use crate::support::*;

mod render_wgpu_environment_skybox {
    use super::*;

    #[test]
    fn is_a_no_op_when_the_environment_has_no_complete_source_cube() {
        let mut test = make_wgpu_scene3d_state(None);
        let before = test.calls.lock().unwrap().len();
        let mut pass = get_wgpu_active_render_pass_handle(&mut test.state).unwrap();
        render_wgpu_environment_skybox(&mut pass, &flight_lighting::create_environment(), &make_test_camera(), 1.0);
        assert_eq!(test.calls.lock().unwrap().len(), before);
    }

    #[test]
    fn binds_the_cube_and_uniform_and_draws_the_fullscreen_backdrop() {
        let mut test = make_wgpu_scene3d_state(None);
        let camera = make_test_camera();
        camera.inverse_view_projection.write().unwrap().m[0] = 42.0;
        let (environment, _fake) = create_test_image_environment();
        let mut pass = get_wgpu_active_render_pass_handle(&mut test.state).unwrap();
        render_wgpu_environment_skybox(&mut pass, &environment, &camera, 1.0);

        assert_ne!(camera.inverse_view_projection.read().unwrap().m[0], 42.0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.set_bind_groups().iter().any(|set| set.index == 1));
        assert!(test.draws().iter().any(|draw| draw.vertex_count == 3));
    }

    #[test]
    fn compiles_skybox_wgsl_that_reconstructs_the_ray_from_the_inverse_view_projection() {
        let mut test = make_wgpu_scene3d_state(None);
        let (environment, _fake) = create_test_image_environment();
        let mut pass = get_wgpu_active_render_pass_handle(&mut test.state).unwrap();
        render_wgpu_environment_skybox(&mut pass, &environment, &make_test_camera(), 1.0);

        let shader = test
            .shader_sources()
            .into_iter()
            .find(|source| source.contains("inverseViewProjection"))
            .unwrap();
        assert!(shader.contains("texture_cube<f32>"));
    }
}
