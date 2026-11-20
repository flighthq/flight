use std::io::Cursor;

use flight_image_codec::{DecodedImage, ImageDecodeOptions, ImageEncodeOptions};

use crate::backend::{
    CodecFailure, create_bounded_writer, create_codec_failure, did_bounded_writer_exceed_limit,
    premultiply_rgba, take_bounded_writer_bytes, validate_dimensions, validate_encode_image,
};
use crate::types::{ImageCodecsHostOperationExplanationReason, ImageCodecsHostOptions};

// The repository source-order rule keeps modules before functions.
#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod tests {
    use super::*;

    fn decode_fixture(
        data: &[u8],
        width: u16,
        height: u16,
        color: jpeg_encoder::ColorType,
    ) -> DecodedImage {
        let mut encoded = Vec::new();
        jpeg_encoder::Encoder::new(&mut encoded, 100)
            .encode(data, width, height, color)
            .expect("generated JPEG fixture encodes");
        return decode_jpeg(&crate::create_image_codecs_host_options(), &encoded, None)
            .unwrap_or_else(|failure| {
                panic!("generated JPEG fixture decodes: {}", failure.message)
            });
    }

    #[test]
    fn decodes_generated_l8_as_opaque_grayscale_rgba() {
        let source = vec![137; 8 * 8];
        let decoded = decode_fixture(&source, 8, 8, jpeg_encoder::ColorType::Luma);
        assert_eq!((decoded.width, decoded.height), (8, 8));
        assert_eq!(decoded.data.len(), 8 * 8 * 4);
        for pixel in decoded.data.as_chunks::<4>().0 {
            assert_eq!(pixel[0], pixel[1]);
            assert_eq!(pixel[1], pixel[2]);
            assert_eq!(pixel[3], 255);
            assert!(
                pixel[0].abs_diff(137) <= 2,
                "unexpected grayscale value: {pixel:?}"
            );
        }
    }

    #[test]
    fn decodes_generated_non_neutral_rgb_in_channel_order() {
        const EXPECTED: [u8; 3] = [201, 74, 19];
        let source = EXPECTED.repeat(8 * 8);
        let decoded = decode_fixture(&source, 8, 8, jpeg_encoder::ColorType::Rgb);
        assert_eq!((decoded.width, decoded.height), (8, 8));
        assert_eq!(decoded.data.len(), 8 * 8 * 4);
        for pixel in decoded.data.as_chunks::<4>().0 {
            for (actual, expected) in pixel[..3].iter().zip(EXPECTED) {
                assert!(
                    actual.abs_diff(expected) <= 3,
                    "unexpected RGB channel order or value: {pixel:?}"
                );
            }
            assert_eq!(pixel[3], 255);
        }
    }
}

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
            for pixel in decoded.as_chunks::<2>().0 {
                let value = pixel[0];
                rgba.extend_from_slice(&[value, value, value, 255]);
            }
        }
        jpeg_decoder::PixelFormat::RGB24 => {
            for pixel in decoded.as_chunks::<3>().0 {
                rgba.extend_from_slice(&[pixel[0], pixel[1], pixel[2], 255]);
            }
        }
        jpeg_decoder::PixelFormat::CMYK32 => {
            for pixel in decoded.as_chunks::<4>().0 {
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
    for pixel in image.data.as_chunks::<4>().0 {
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
