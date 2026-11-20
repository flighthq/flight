#[cfg(any(feature = "jpeg", feature = "png"))]
use std::io::{self, Write};

#[cfg(any(feature = "jpeg", feature = "png"))]
use flight_image_codec::DecodedImage;

use crate::types::ImageCodecsHostOperationExplanationReason;
#[cfg(any(feature = "jpeg", feature = "png"))]
use crate::types::ImageCodecsHostOptions;

pub(crate) struct CodecFailure {
    pub(crate) message: &'static str,
    pub(crate) reason: ImageCodecsHostOperationExplanationReason,
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) struct BoundedWriter {
    bytes: Vec<u8>,
    exceeded: bool,
    limit: usize,
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn create_bounded_writer(limit: usize) -> BoundedWriter {
    return BoundedWriter {
        bytes: Vec::new(),
        exceeded: false,
        limit,
    };
}

pub(crate) fn create_codec_failure(
    reason: ImageCodecsHostOperationExplanationReason,
    message: &'static str,
) -> CodecFailure {
    return CodecFailure { message, reason };
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn did_bounded_writer_exceed_limit(writer: &BoundedWriter) -> bool {
    return writer.exceeded;
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn empty_decoded_image() -> DecodedImage {
    return DecodedImage {
        data: Box::default(),
        height: 0,
        width: 0,
    };
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn flush_bounded_writer(_writer: &mut BoundedWriter) -> io::Result<()> {
    return Ok(());
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn premultiply_rgba(data: &mut [u8]) {
    for pixel in data.as_chunks_mut::<4>().0 {
        let alpha = u16::from(pixel[3]);
        pixel[0] = ((u16::from(pixel[0]) * alpha + 127) / 255) as u8;
        pixel[1] = ((u16::from(pixel[1]) * alpha + 127) / 255) as u8;
        pixel[2] = ((u16::from(pixel[2]) * alpha + 127) / 255) as u8;
    }
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn take_bounded_writer_bytes(writer: BoundedWriter) -> Box<[u8]> {
    return writer.bytes.into_boxed_slice();
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn validate_dimensions(
    options: &ImageCodecsHostOptions,
    width: usize,
    height: usize,
) -> Result<usize, CodecFailure> {
    if width == 0 || height == 0 {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::InvalidDimensions,
            "image dimensions must be nonzero",
        ));
    }
    if width > options.max_width || height > options.max_height {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
            "image dimensions exceed the host limits",
        ));
    }
    let pixels = width.checked_mul(height).ok_or_else(|| {
        create_codec_failure(
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
            "image pixel count overflows",
        )
    })?;
    if pixels > options.max_pixels {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
            "image pixel count exceeds the host limit",
        ));
    }
    return pixels.checked_mul(4).ok_or_else(|| {
        create_codec_failure(
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
            "decoded byte length overflows",
        )
    });
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn validate_encode_image(
    options: &ImageCodecsHostOptions,
    image: &DecodedImage,
) -> Result<(), CodecFailure> {
    let expected = validate_dimensions(options, image.width, image.height)?;
    if image.data.len() != expected {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::PixelLengthMismatch,
            "RGBA pixel length does not match width times height times four",
        ));
    }
    return Ok(());
}

#[cfg(any(feature = "jpeg", feature = "png"))]
pub(crate) fn write_bounded_writer(writer: &mut BoundedWriter, buffer: &[u8]) -> io::Result<usize> {
    let Some(end) = writer.bytes.len().checked_add(buffer.len()) else {
        writer.exceeded = true;
        return Err(io::Error::new(
            io::ErrorKind::StorageFull,
            "encoded image exceeds the host output limit",
        ));
    };
    if end > writer.limit {
        writer.exceeded = true;
        return Err(io::Error::new(
            io::ErrorKind::StorageFull,
            "encoded image exceeds the host output limit",
        ));
    }
    writer.bytes.extend_from_slice(buffer);
    return Ok(buffer.len());
}

#[cfg(any(feature = "jpeg", feature = "png"))]
impl Write for BoundedWriter {
    fn flush(&mut self) -> io::Result<()> {
        return flush_bounded_writer(self);
    }

    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        return write_bounded_writer(self, buffer);
    }
}
