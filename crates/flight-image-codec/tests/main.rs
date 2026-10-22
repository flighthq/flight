use std::future::Future;
use std::task::{Context, Poll, Waker};

pub(crate) fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

#[path = "decode_image_test.rs"]
mod flight_image_codec_decode_image_test;
#[path = "detect_image_mime_type_test.rs"]
mod flight_image_codec_detect_image_mime_type_test;
#[path = "encode_image_test.rs"]
mod flight_image_codec_encode_image_test;
#[path = "host_explain_test.rs"]
mod flight_image_codec_host_explain_test;
