use std::io::Cursor;

use flight_image_codec::{DecodedImage, ImageDecodeOptions, ImageEncodeOptions};

use crate::backend::{
    CodecFailure, create_bounded_writer, create_codec_failure, did_bounded_writer_exceed_limit,
    premultiply_rgba, take_bounded_writer_bytes, validate_dimensions, validate_encode_image,
};
use crate::types::{ImageCodecsHostOperationExplanationReason, ImageCodecsHostOptions};

pub(crate) fn decode_jpeg(
    options: &ImageCodecsHostOptions,
    bytes: &[u8],
    decode_options: Option<&ImageDecodeOptions>,
) -> Result<DecodedImage, CodecFailure> {
    let mut decoder = jpeg_decoder::Decoder::new(Cursor::new(bytes));
    decoder.read_info().map_err(|_| malformed_jpeg())?;
    let info = decoder.info().ok_or_else(malformed_jpeg)?;
    let width = usize::from(info.width);
    let height = usize::from(info.height);
    let rgba_length = validate_dimensions(options, width, height)?;
    decoder.set_max_decoding_buffer_size(rgba_length);
    let decoded = decoder.decode().map_err(|_| malformed_jpeg())?;
    let mut rgba = Vec::with_capacity(rgba_length);
    match info.pixel_format {
        jpeg_decoder::PixelFormat::L8 => {
            for value in decoded {
                rgba.extend_from_slice(&[value, value, value, 255]);
            }
        }
        jpeg_decoder::PixelFormat::L16 => {
            for pixel in decoded.chunks_exact(2) {
                let value = pixel[0];
                rgba.extend_from_slice(&[value, value, value, 255]);
            }
        }
        jpeg_decoder::PixelFormat::RGB24 => {
            for pixel in decoded.chunks_exact(3) {
                rgba.extend_from_slice(&[pixel[0], pixel[1], pixel[2], 255]);
            }
        }
        jpeg_decoder::PixelFormat::CMYK32 => {
            for pixel in decoded.chunks_exact(4) {
                let black = 255 - u16::from(pixel[3]);
                let red = ((255 - u16::from(pixel[0])) * black + 127) / 255;
                let green = ((255 - u16::from(pixel[1])) * black + 127) / 255;
                let blue = ((255 - u16::from(pixel[2])) * black + 127) / 255;
                rgba.extend_from_slice(&[red as u8, green as u8, blue as u8, 255]);
            }
        }
    }
    if rgba.len() != rgba_length {
        return Err(malformed_jpeg());
    }
    if decode_options
        .and_then(|options| options.premultiply_alpha)
        .unwrap_or(false)
    {
        premultiply_rgba(&mut rgba);
    }
    return Ok(DecodedImage {
        data: rgba.into_boxed_slice(),
        height,
        width,
    });
}

pub(crate) fn encode_jpeg(
    options: &ImageCodecsHostOptions,
    image: &DecodedImage,
    encode_options: Option<&ImageEncodeOptions>,
) -> Result<Box<[u8]>, CodecFailure> {
    validate_encode_image(options, image)?;
    let width = u16::try_from(image.width).map_err(|_| invalid_jpeg_dimensions())?;
    let height = u16::try_from(image.height).map_err(|_| invalid_jpeg_dimensions())?;
    let quality = jpeg_quality(encode_options)?;
    let mut rgb = Vec::with_capacity(image.width * image.height * 3);
    for pixel in image.data.chunks_exact(4) {
        rgb.extend_from_slice(&pixel[..3]);
    }
    let mut output = create_bounded_writer(options.max_encoded_bytes);
    let encoded = jpeg_encoder::Encoder::new(&mut output, quality).encode(
        &rgb,
        width,
        height,
        jpeg_encoder::ColorType::Rgb,
    );
    if encoded.is_err() {
        return Err(if did_bounded_writer_exceed_limit(&output) {
            create_codec_failure(
                ImageCodecsHostOperationExplanationReason::OutputTooLarge,
                "JPEG output exceeds the host limit",
            )
        } else {
            create_codec_failure(
                ImageCodecsHostOperationExplanationReason::EncodeFailed,
                "JPEG encoding failed",
            )
        });
    }
    return Ok(take_bounded_writer_bytes(output));
}

fn invalid_jpeg_dimensions() -> CodecFailure {
    return create_codec_failure(
        ImageCodecsHostOperationExplanationReason::InvalidDimensions,
        "JPEG dimensions exceed the format limit",
    );
}

fn jpeg_quality(options: Option<&ImageEncodeOptions>) -> Result<u8, CodecFailure> {
    let quality = options.and_then(|options| options.quality).unwrap_or(0.9);
    if !quality.is_finite() || !(0.0..=1.0).contains(&quality) {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::InvalidQuality,
            "JPEG quality must be finite and within zero through one",
        ));
    }
    return Ok((quality.mul_add(99.0, 1.0).round() as u8).clamp(1, 100));
}

fn malformed_jpeg() -> CodecFailure {
    return create_codec_failure(
        ImageCodecsHostOperationExplanationReason::MalformedInput,
        "JPEG input is malformed or truncated",
    );
}
