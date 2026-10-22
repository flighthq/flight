use std::future::Future;
use std::task::{Context, Poll, Waker};

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

#[path = "audio_buffer_test.rs"]
mod flight_audio_audio_buffer_test;
#[path = "audio_decode_slot_test.rs"]
mod flight_audio_audio_decode_slot_test;
#[path = "audio_format_test.rs"]
mod flight_audio_audio_format_test;
#[path = "audio_resource_from_test.rs"]
mod flight_audio_audio_resource_from_test;
#[path = "audio_resource_reference_test.rs"]
mod flight_audio_audio_resource_reference_test;
#[path = "audio_resource_test.rs"]
mod flight_audio_audio_resource_test;
#[path = "decode_audio_resource_bytes_test.rs"]
mod flight_audio_decode_audio_resource_bytes_test;
#[path = "host_explain_test.rs"]
mod flight_audio_host_explain_test;
#[path = "types_test.rs"]
mod flight_audio_types_test;
