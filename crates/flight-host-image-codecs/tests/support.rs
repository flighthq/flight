#[cfg(any(feature = "jpeg", feature = "png"))]
use std::future::Future;
#[cfg(any(feature = "jpeg", feature = "png"))]
use std::task::{Context, Poll, Waker};

use flight_host_image_codecs::{
    ImageCodecsHostOperationExplanation, ImageCodecsHostOperationExplanationReason,
};
use flight_image_codec::DecodedImage;

#[cfg(any(feature = "jpeg", feature = "png"))]
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

pub(crate) fn assert_reason(
    explanation: &ImageCodecsHostOperationExplanation,
    reason: ImageCodecsHostOperationExplanationReason,
) {
    assert_eq!(explanation.reason, reason, "{}", explanation.message);
    if reason == ImageCodecsHostOperationExplanationReason::Ready {
        assert!(explanation.message.is_empty());
    } else {
        assert!(!explanation.message.is_empty());
    }
}

pub(crate) fn generated_rgba_image() -> DecodedImage {
    // The non-square dimensions and unique row/pixel values make channel or stride swaps visible.
    let data = vec![
        255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 64, // row zero
        12, 34, 56, 0, 78, 90, 123, 192, 210, 180, 140, 255, // row one
    ];
    return DecodedImage {
        data: data.into_boxed_slice(),
        height: 2,
        width: 3,
    };
}

#[cfg(feature = "jpeg")]
pub(crate) fn generated_jpeg_image() -> DecodedImage {
    let width = 16;
    let height = 8;
    let mut data = Vec::with_capacity(width * height * 4);
    for y in 0..height {
        for x in 0..width {
            let value = ((x * 11 + y * 7 + 23) % 192 + 32) as u8;
            data.extend_from_slice(&[value, value, value, (x * 13 + y * 17) as u8]);
        }
    }
    return DecodedImage {
        data: data.into_boxed_slice(),
        height,
        width,
    };
}
