use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

/// Raw decoded image: straight (non-premultiplied) RGBA8 pixels plus dimensions. `data` is
/// row-major, 4 bytes per pixel, `width * height * 4` bytes long. The IR uses `Box<[u8]>`
/// (TS `Uint8ClampedArray`) under the approved pixel rule; stores clamp explicitly.
#[derive(Clone, Debug, PartialEq)]
pub struct DecodedImage {
    pub data: Box<[u8]>,
    pub height: usize,
    pub width: usize,
}

/// Options for a decode capability. `premultiply_alpha` requests premultiplied RGBA output;
/// straight alpha is the default when omitted.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ImageDecodeOptions {
    pub premultiply_alpha: Option<bool>,
}

/// Options for an encode capability. `quality` is a [0, 1] lossy hint.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ImageEncodeOptions {
    pub quality: Option<f32>,
}

/// Boxed, Send future returned by an async capability (D15).
pub type ImageDecodeFuture = Pin<Box<dyn Future<Output = DecodedImage> + Send>>;

/// Boxed, Send future returned by an encode capability (D15).
pub type ImageEncodeFuture = Pin<Box<dyn Future<Output = Box<[u8]>> + Send>>;

/// One decode capability slot. Inputs are owned because the boxed future is `Send + 'static`;
/// see the package report for the borrowed-form limitation.
pub struct HostImageDecodeFormatCapability {
    pub decode: Arc<dyn Fn(Vec<u8>, Option<ImageDecodeOptions>) -> ImageDecodeFuture + Send + Sync>,
}

/// Available decode capabilities, by format.
#[derive(Default)]
pub struct HostImageDecodeCapabilities {
    pub avif: Option<HostImageDecodeFormatCapability>,
    pub bmp: Option<HostImageDecodeFormatCapability>,
    pub gif: Option<HostImageDecodeFormatCapability>,
    pub jpeg: Option<HostImageDecodeFormatCapability>,
    pub png: Option<HostImageDecodeFormatCapability>,
    pub webp: Option<HostImageDecodeFormatCapability>,
}

/// One encode capability slot.
pub struct HostImageEncodeFormatCapability {
    pub encode:
        Arc<dyn Fn(DecodedImage, Option<ImageEncodeOptions>) -> ImageEncodeFuture + Send + Sync>,
}

/// Available encode capabilities, by format.
#[derive(Default)]
pub struct HostImageEncodeCapabilities {
    pub jpeg: Option<HostImageEncodeFormatCapability>,
    pub png: Option<HostImageEncodeFormatCapability>,
    pub webp: Option<HostImageEncodeFormatCapability>,
}
