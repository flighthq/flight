use std::io::Cursor;

use flight_image_codec::{DecodedImage, ImageDecodeOptions};

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
        width: u32,
        height: u32,
        color_type: png::ColorType,
        source: &[u8],
    ) -> DecodedImage {
        let mut encoded = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut encoded, width, height);
            encoder.set_color(color_type);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder
                .write_header()
                .expect("generated PNG header encodes");
            writer
                .write_image_data(source)
                .expect("generated PNG pixels encode");
            writer.finish().expect("generated PNG fixture finishes");
        }
        return decode_png(&crate::create_image_codecs_host_options(), &encoded, None)
            .unwrap_or_else(|failure| {
                panic!("generated PNG fixture decodes: {}", failure.message)
            });
    }

    #[test]
    fn decoded_length_guard_rejects_incomplete_expansion() {
        let failure = expand_png_to_rgba(&[1, 2, 3], png::ColorType::Rgb, 8)
            .expect_err("one RGB pixel cannot satisfy a two-pixel RGBA result");
        assert_eq!(
            failure.reason,
            ImageCodecsHostOperationExplanationReason::MalformedInput
        );
    }

    #[test]
    fn decodes_generated_grayscale_as_opaque_rgba() {
        let decoded = decode_fixture(3, 1, png::ColorType::Grayscale, &[7, 91, 240]);
        assert_eq!((decoded.width, decoded.height), (3, 1));
        assert_eq!(
            decoded.data.as_ref(),
            &[7, 7, 7, 255, 91, 91, 91, 255, 240, 240, 240, 255]
        );
    }

    #[test]
    fn decodes_generated_grayscale_alpha_with_source_alpha() {
        let decoded = decode_fixture(
            3,
            1,
            png::ColorType::GrayscaleAlpha,
            &[11, 0, 99, 128, 230, 255],
        );
        assert_eq!((decoded.width, decoded.height), (3, 1));
        assert_eq!(
            decoded.data.as_ref(),
            &[11, 11, 11, 0, 99, 99, 99, 128, 230, 230, 230, 255]
        );
    }

    #[test]
    fn decodes_generated_rgb_with_exact_stride_and_channel_order() {
        let source = [
            1, 2, 3, 10, 20, 30, 40, 50, 60, // row zero
            70, 80, 90, 100, 110, 120, 130, 140, 150, // row one
        ];
        let decoded = decode_fixture(3, 2, png::ColorType::Rgb, &source);
        assert_eq!((decoded.width, decoded.height), (3, 2));
        assert_eq!(
            decoded.data.as_ref(),
            &[
                1, 2, 3, 255, 10, 20, 30, 255, 40, 50, 60, 255, // row zero
                70, 80, 90, 255, 100, 110, 120, 255, 130, 140, 150, 255,
            ]
        );
    }
}

pub(crate) fn decode_png(
    options: &ImageCodecsHostOptions,
    bytes: &[u8],
    decode_options: Option<&ImageDecodeOptions>,
) -> Result<DecodedImage, CodecFailure> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|_| malformed_png())?;
    let width = reader.info().width as usize;
    let height = reader.info().height as usize;
    let rgba_length = validate_dimensions(options, width, height)?;
    let output_length = reader.output_buffer_size();
    if output_length > rgba_length {
        return Err(create_codec_failure(
            ImageCodecsHostOperationExplanationReason::ResourceLimitExceeded,
            "PNG decoded byte length exceeds the host limit",
        ));
    }
    let mut decoded = vec![0; output_length];
    let frame = reader
        .next_frame(&mut decoded)
        .map_err(|_| malformed_png())?;
    let source = &decoded[..frame.buffer_size()];
    let mut rgba = expand_png_to_rgba(source, frame.color_type, rgba_length)?;
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

pub(crate) fn encode_png(
    options: &ImageCodecsHostOptions,
    image: &DecodedImage,
) -> Result<Box<[u8]>, CodecFailure> {
    validate_encode_image(options, image)?;
    let width = u32::try_from(image.width).map_err(|_| invalid_png_dimensions())?;
    let height = u32::try_from(image.height).map_err(|_| invalid_png_dimensions())?;
    let mut output = create_bounded_writer(options.max_encoded_bytes);
    let encoded = {
        let mut encoder = png::Encoder::new(&mut output, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        match encoder.write_header() {
            Ok(mut writer) => writer
                .write_image_data(&image.data)
                .and_then(|_| writer.finish()),
            Err(error) => Err(error),
        }
    };
    if encoded.is_err() {
        return Err(if did_bounded_writer_exceed_limit(&output) {
            create_codec_failure(
                ImageCodecsHostOperationExplanationReason::OutputTooLarge,
                "PNG output exceeds the host limit",
            )
        } else {
            create_codec_failure(
                ImageCodecsHostOperationExplanationReason::EncodeFailed,
                "PNG encoding failed",
            )
        });
    }
    return Ok(take_bounded_writer_bytes(output));
}

fn expand_png_to_rgba(
    source: &[u8],
    color_type: png::ColorType,
    rgba_length: usize,
) -> Result<Vec<u8>, CodecFailure> {
    let mut rgba = Vec::with_capacity(rgba_length);
    match color_type {
        png::ColorType::Grayscale => {
            for value in source {
                rgba.extend_from_slice(&[*value, *value, *value, 255]);
            }
        }
        png::ColorType::GrayscaleAlpha => {
            for pixel in source.as_chunks::<2>().0 {
                rgba.extend_from_slice(&[pixel[0], pixel[0], pixel[0], pixel[1]]);
            }
        }
        png::ColorType::Rgb => {
            for pixel in source.as_chunks::<3>().0 {
                rgba.extend_from_slice(&[pixel[0], pixel[1], pixel[2], 255]);
            }
        }
        png::ColorType::Rgba => rgba.extend_from_slice(source),
        _ => {
            return Err(create_codec_failure(
                ImageCodecsHostOperationExplanationReason::UnsupportedPixelFormat,
                "PNG pixel format is unsupported",
            ));
        }
    }
    if rgba.len() != rgba_length {
        return Err(malformed_png());
    }
    return Ok(rgba);
}

fn invalid_png_dimensions() -> CodecFailure {
    return create_codec_failure(
        ImageCodecsHostOperationExplanationReason::InvalidDimensions,
        "PNG dimensions exceed the format limit",
    );
}

fn malformed_png() -> CodecFailure {
    return create_codec_failure(
        ImageCodecsHostOperationExplanationReason::MalformedInput,
        "PNG input is malformed or truncated",
    );
}
