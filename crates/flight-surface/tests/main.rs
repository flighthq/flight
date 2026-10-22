mod canvas_surface_test;
mod surface_display_test;
mod surface_test;
mod wgpu_host_acquisition_test;
mod window_render_state_test;

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
