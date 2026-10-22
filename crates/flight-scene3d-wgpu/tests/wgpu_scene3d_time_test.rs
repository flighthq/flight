use flight_scene3d_wgpu::*;

use crate::support::*;

mod get_wgpu_scene3d_time {
    use super::*;

    #[test]
    fn defaults_to_zero_and_reads_the_state_scoped_value() {
        let mut test = make_wgpu_scene3d_state(None);
        assert_eq!(get_wgpu_scene3d_time(&mut test.state), 0.0);
        set_wgpu_scene3d_time(&mut test.state, 2.5);
        assert_eq!(get_wgpu_scene3d_time(&mut test.state), 2.5);
    }
}

mod set_wgpu_scene3d_time {
    use super::*;

    #[test]
    fn does_not_leak_across_render_states() {
        let mut first = make_wgpu_scene3d_state(None);
        let mut second = make_wgpu_scene3d_state(None);
        set_wgpu_scene3d_time(&mut first.state, 4.0);
        assert_eq!(get_wgpu_scene3d_time(&mut second.state), 0.0);
    }
}
