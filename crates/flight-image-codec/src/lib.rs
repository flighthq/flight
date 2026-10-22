mod decode_image;
mod detect_image_mime_type;
mod encode_image;
mod host_explain;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` exports plus the locally owned types their signatures use.
pub use contract::decode_image;
pub use contract::decode_image_premultiplied;
pub use contract::detect_image_mime_type;
pub use contract::encode_image;

pub use contract::DecodedImage;
pub use contract::HostImageDecodeCapabilities;
pub use contract::HostImageDecodeFormatCapability;
pub use contract::HostImageEncodeCapabilities;
pub use contract::HostImageEncodeFormatCapability;
pub use contract::ImageDecodeFuture;
pub use contract::ImageDecodeOptions;
pub use contract::ImageEncodeFuture;
pub use contract::ImageEncodeOptions;

#[cfg(test)]
pub(crate) mod test_support {
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
}
