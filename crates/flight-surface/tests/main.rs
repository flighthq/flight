// Drives a provider future to completion on the test thread.
pub fn block_on<F: std::future::Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = std::task::Context::from_waker(std::task::Waker::noop());
    loop {
        if let std::task::Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
    }
}

#[path = "canvas_surface_test.rs"]
mod flight_surface_canvas_surface_test;
#[path = "host_explain_test.rs"]
mod flight_surface_host_explain_test;
#[path = "surface_display_test.rs"]
mod flight_surface_surface_display_test;
#[path = "surface_test.rs"]
mod flight_surface_surface_test;
#[path = "wgpu_host_acquisition_test.rs"]
mod flight_surface_wgpu_host_acquisition_test;
#[path = "window_render_state_test.rs"]
mod flight_surface_window_render_state_test;
