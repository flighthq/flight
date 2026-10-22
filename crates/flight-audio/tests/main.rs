use std::future::Future;
use std::task::{Context, Poll, Waker};

mod audio_buffer_test;
mod audio_decode_slot_test;
mod audio_format_test;
mod audio_resource_from_test;
mod audio_resource_reference_test;
mod audio_resource_test;
mod decode_audio_resource_bytes_test;
mod host_explain_test;
mod types_test;

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}
