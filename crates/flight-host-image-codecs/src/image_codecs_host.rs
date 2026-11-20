use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use flight_image_codec::{
    DecodedImage, HostImageDecodeCapabilities, HostImageEncodeCapabilities, ImageDecodeOptions,
    ImageEncodeOptions,
};
#[cfg(any(feature = "jpeg", feature = "png"))]
use flight_image_codec::{HostImageDecodeFormatCapability, HostImageEncodeFormatCapability};

use crate::backend::{CodecFailure, create_codec_failure};
use crate::types::*;

fn create_decode_capabilities(
    _state: &Arc<ImageCodecsHostState>,
    _options: &ImageCodecsHostOptions,
) -> HostImageDecodeCapabilities {
    return HostImageDecodeCapabilities {
        avif: None,
        bmp: None,
        gif: None,
        jpeg: {
            #[cfg(feature = "jpeg")]
            {
                Some(create_decode_slot(_state, _options, "image/jpeg"))
            }
            #[cfg(not(feature = "jpeg"))]
            {
                None
            }
        },
        png: {
            #[cfg(feature = "png")]
            {
                Some(create_decode_slot(_state, _options, "image/png"))
            }
            #[cfg(not(feature = "png"))]
            {
                None
            }
        },
        webp: None,
    };
}

#[cfg(any(feature = "jpeg", feature = "png"))]
fn create_decode_slot(
    state: &Arc<ImageCodecsHostState>,
    options: &ImageCodecsHostOptions,
    mime_type: &'static str,
) -> HostImageDecodeFormatCapability {
    let state = state.clone();
    let host_options = options.clone();
    return HostImageDecodeFormatCapability {
        decode: Arc::new(move |bytes, options| {
            let state = state.clone();
            let host_options = host_options.clone();
            return Box::pin(async move {
                decode_with_parts(&state, &host_options, &bytes, mime_type, options.as_ref())
                    .unwrap_or_else(|_| crate::backend::empty_decoded_image())
            });
        }),
    };
}

fn create_encode_capabilities(
    _state: &Arc<ImageCodecsHostState>,
    _options: &ImageCodecsHostOptions,
) -> HostImageEncodeCapabilities {
    return HostImageEncodeCapabilities {
        jpeg: {
            #[cfg(feature = "jpeg")]
            {
                Some(create_encode_slot(_state, _options, "image/jpeg"))
            }
            #[cfg(not(feature = "jpeg"))]
            {
                None
            }
        },
        png: {
            #[cfg(feature = "png")]
            {
                Some(create_encode_slot(_state, _options, "image/png"))
            }
            #[cfg(not(feature = "png"))]
            {
                None
            }
        },
        webp: None,
    };
}

#[cfg(any(feature = "jpeg", feature = "png"))]
fn create_encode_slot(
    state: &Arc<ImageCodecsHostState>,
    options: &ImageCodecsHostOptions,
    mime_type: &'static str,
) -> HostImageEncodeFormatCapability {
    let state = state.clone();
    let host_options = options.clone();
    return HostImageEncodeFormatCapability {
        encode: Arc::new(move |image, options| {
            let state = state.clone();
            let host_options = host_options.clone();
            return Box::pin(async move {
                encode_with_parts(&state, &host_options, &image, mime_type, options.as_ref())
                    .unwrap_or_default()
            });
        }),
    };
}

/// Creates a Rust-native image-codec host. Format features decide which capability slots are
/// filled; construction itself performs no native or process-global initialization.
pub fn create_image_codecs_host(options: Option<&ImageCodecsHostOptions>) -> ImageCodecsHost {
    let options = options
        .cloned()
        .unwrap_or_else(create_image_codecs_host_options);
    let state = Arc::new(ImageCodecsHostState {
        alive: AtomicBool::new(true),
    });
    let decode = create_decode_capabilities(&state, &options);
    let encode = create_encode_capabilities(&state, &options);
    return ImageCodecsHost {
        decode,
        encode,
        options,
        state,
    };
}

/// Default bounded-service limits: 64 MiB encoded input/output, 16,384 pixels per dimension and
/// 64 million decoded pixels.
pub fn create_image_codecs_host_options() -> ImageCodecsHostOptions {
    return ImageCodecsHostOptions {
        max_encoded_bytes: 64 * 1024 * 1024,
        max_height: 16_384,
        max_pixels: 64 * 1024 * 1024,
        max_width: 16_384,
    };
}

/// Decodes PNG or JPEG bytes through this host. Returns `None` for an unavailable format,
/// malformed input, exceeded resource limit or a destroyed host;
/// `explain_image_codecs_host_decode` distinguishes the reason.
pub fn decode_image_with_image_codecs_host(
    host: &ImageCodecsHost,
    bytes: &[u8],
    mime_type: &str,
    options: Option<&ImageDecodeOptions>,
) -> Option<DecodedImage> {
    return decode_with_parts(&host.state, &host.options, bytes, mime_type, options).ok();
}

fn decode_with_parts(
    state: &ImageCodecsHostState,
    options: &ImageCodecsHostOptions,
    bytes: &[u8],
    mime_type: &str,
    _decode_options: Option<&ImageDecodeOptions>,
) -> Result<DecodedImage, CodecFailure> {
    require_alive(state)?;
    if bytes.is_empty() {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::MalformedInput,
            "encoded image input is empty",
        ));
    }
    if bytes.len() > options.max_encoded_bytes {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::InputTooLarge,
            "encoded image input exceeds the host limit",
        ));
    }
    match mime_type {
        "image/jpeg" => {
            #[cfg(feature = "jpeg")]
            return crate::jpeg_backend::decode_jpeg(options, bytes, _decode_options);
            #[cfg(not(feature = "jpeg"))]
            return Err(format_unavailable());
        }
        "image/png" => {
            #[cfg(feature = "png")]
            return crate::png_backend::decode_png(options, bytes, _decode_options);
            #[cfg(not(feature = "png"))]
            return Err(format_unavailable());
        }
        _ => {
            return Err(create_codec_failure(
                ImageCodecsHostOperationExplanationReason::UnsupportedMimeType,
                "image MIME type is not supported by this host",
            ));
        }
    }
}

/// Invalidates the host and every retained callback immediately. Destroying twice is a no-op.
pub fn destroy_image_codecs_host(host: &mut ImageCodecsHost) {
    host.state.alive.store(false, Ordering::Release);
}

/// Encodes RGBA pixels as PNG or JPEG through this host. JPEG discards alpha. Returns `None` for
/// invalid dimensions/pixel length/options, an unavailable format, an exceeded output limit or a
/// destroyed host; `explain_image_codecs_host_encode` distinguishes the reason.
pub fn encode_image_with_image_codecs_host(
    host: &ImageCodecsHost,
    image: &DecodedImage,
    mime_type: &str,
    options: Option<&ImageEncodeOptions>,
) -> Option<Box<[u8]>> {
    return encode_with_parts(&host.state, &host.options, image, mime_type, options).ok();
}

fn encode_with_parts(
    state: &ImageCodecsHostState,
    _options: &ImageCodecsHostOptions,
    _image: &DecodedImage,
    mime_type: &str,
    _encode_options: Option<&ImageEncodeOptions>,
) -> Result<Box<[u8]>, CodecFailure> {
    require_alive(state)?;
    match mime_type {
        "image/jpeg" => {
            #[cfg(feature = "jpeg")]
            return crate::jpeg_backend::encode_jpeg(_options, _image, _encode_options);
            #[cfg(not(feature = "jpeg"))]
            return Err(format_unavailable());
        }
        "image/png" => {
            #[cfg(feature = "png")]
            return crate::png_backend::encode_png(_options, _image);
            #[cfg(not(feature = "png"))]
            return Err(format_unavailable());
        }
        _ => {
            return Err(create_codec_failure(
                ImageCodecsHostOperationExplanationReason::UnsupportedMimeType,
                "image MIME type is not supported by this host",
            ));
        }
    }
}

/// Re-runs the bounded decode probe and reports why the matching direct/capability call returns a
/// sentinel, or `Ready` when it succeeds. Nothing is retained.
pub fn explain_image_codecs_host_decode(
    host: &ImageCodecsHost,
    bytes: &[u8],
    mime_type: &str,
    options: Option<&ImageDecodeOptions>,
) -> ImageCodecsHostOperationExplanation {
    return explain_result(decode_with_parts(
        &host.state,
        &host.options,
        bytes,
        mime_type,
        options,
    ));
}

/// Re-runs the bounded encode probe and reports why the matching direct/capability call returns a
/// sentinel, or `Ready` when it succeeds. Nothing is retained.
pub fn explain_image_codecs_host_encode(
    host: &ImageCodecsHost,
    image: &DecodedImage,
    mime_type: &str,
    options: Option<&ImageEncodeOptions>,
) -> ImageCodecsHostOperationExplanation {
    return explain_result(encode_with_parts(
        &host.state,
        &host.options,
        image,
        mime_type,
        options,
    ));
}

fn explain_result<T>(result: Result<T, CodecFailure>) -> ImageCodecsHostOperationExplanation {
    return match result {
        Ok(_) => ImageCodecsHostOperationExplanation {
            message: String::new(),
            reason: ImageCodecsHostOperationExplanationReason::Ready,
        },
        Err(failure) => ImageCodecsHostOperationExplanation {
            message: failure.message.to_string(),
            reason: failure.reason,
        },
    };
}

#[cfg(any(not(feature = "jpeg"), not(feature = "png")))]
fn format_unavailable() -> CodecFailure {
    return create_codec_failure(
        ImageCodecsHostOperationExplanationReason::FormatUnavailable,
        "image format support is not enabled in this host build",
    );
}

/// Borrowed decode capabilities. PNG/JPEG slots are filled only when their same-named crate
/// features are enabled. Retained callback arcs fail closed after host destruction.
pub fn get_image_codecs_host_decode_capabilities(
    host: &ImageCodecsHost,
) -> &HostImageDecodeCapabilities {
    return &host.decode;
}

/// Borrowed encode capabilities. PNG/JPEG slots are filled only when their same-named crate
/// features are enabled. Retained callback arcs fail closed after host destruction.
pub fn get_image_codecs_host_encode_capabilities(
    host: &ImageCodecsHost,
) -> &HostImageEncodeCapabilities {
    return &host.encode;
}

/// Whether the host has been destroyed.
pub fn is_image_codecs_host_destroyed(host: &ImageCodecsHost) -> bool {
    return !host.state.alive.load(Ordering::Acquire);
}

fn require_alive(state: &ImageCodecsHostState) -> Result<(), CodecFailure> {
    if !state.alive.load(Ordering::Acquire) {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::Destroyed,
            "image-codecs host has been destroyed",
        ));
    }
    return Ok(());
}

impl Drop for ImageCodecsHost {
    fn drop(&mut self) {
        destroy_image_codecs_host(self);
    }
}
