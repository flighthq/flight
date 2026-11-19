use flight_host_headless::*;
use flight_render_wgpu::*;

use crate::support::*;

// The presentation extent the SDK reads from a surface the host's capability acquired.
fn acquired_extent(host: &HeadlessHost, width: u32, height: u32) -> (f32, f32) {
    let surface = create_headless_host_surface(host, width, height);
    let capability = get_headless_host_wgpu_capability(host);
    let acquired = pollster::block_on(create_wgpu_acquisition(capability, &surface, None))
        .expect("an immediate acquisition");
    let extent = ((acquired.surface.width)(), (acquired.surface.height)());
    release_wgpu_acquisition(capability, &acquired);
    return extent;
}

mod create_headless_host_surface {
    use super::*;

    #[test]
    fn presents_the_extent_it_was_created_with() {
        let Some(mut host) = create_test_headless_host("presents_the_extent_it_was_created_with")
        else {
            return;
        };
        assert_eq!(acquired_extent(&host, 40, 24), (40.0, 24.0));
        destroy_headless_host(&mut host);
    }

    #[test]
    fn clamps_an_empty_extent_to_one_pixel() {
        let Some(mut host) = create_test_headless_host("clamps_an_empty_extent_to_one_pixel")
        else {
            return;
        };
        assert_eq!(acquired_extent(&host, 0, 0), (1.0, 1.0));
        destroy_headless_host(&mut host);
    }
}
