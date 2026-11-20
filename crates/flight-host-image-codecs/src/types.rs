use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use flight_image_codec::{HostImageDecodeCapabilities, HostImageEncodeCapabilities};

/// A Rust-native PNG/JPEG service and the capability records callers borrow from it. The host owns
/// no process-global state. Dropping or destroying it invalidates retained capability callbacks.
pub struct ImageCodecsHost {
    pub(crate) decode: HostImageDecodeCapabilities,
    pub(crate) encode: HostImageEncodeCapabilities,
    pub(crate) options: ImageCodecsHostOptions,
    pub(crate) state: Arc<ImageCodecsHostState>,
}

/// Plain-data limits applied before decoded pixel allocation and while encoded output is written.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImageCodecsHostOptions {
    pub max_encoded_bytes: usize,
    pub max_height: usize,
    pub max_pixels: usize,
    pub max_width: usize,
}

/// Why a host decode or encode sentinel was returned, or `Ready` when the same call succeeds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum ImageCodecsHostOperationExplanationReason {
    Ready = 0,
    Destroyed = 1,
    UnsupportedMimeType = 2,
    FormatUnavailable = 3,
    MalformedInput = 4,
    InputTooLarge = 5,
    InvalidQuality = 6,
    InvalidDimensions = 7,
    PixelLengthMismatch = 8,
    ResourceLimitExceeded = 9,
    UnsupportedPixelFormat = 10,
    EncodeFailed = 11,
    OutputTooLarge = 12,
}

/// Plain-data answer to why a host decode or encode call returned its sentinel.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImageCodecsHostOperationExplanation {
    pub message: String,
    pub reason: ImageCodecsHostOperationExplanationReason,
}

pub(crate) struct ImageCodecsHostState {
    pub(crate) alive: AtomicBool,
}
