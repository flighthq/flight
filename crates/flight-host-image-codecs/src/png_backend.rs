use std::io::Cursor;

use flight_image_codec::{DecodedImage, ImageDecodeOptions};

use crate::backend::{
    CodecFailure, create_bounded_writer, create_codec_failure, did_bounded_writer_exceed_limit,
    premultiply_rgba, take_bounded_writer_bytes, validate_dimensions, validate_encode_image,
};
use crate::types::{ImageCodecsHostOperationExplanationReason, ImageCodecsHostOptions};

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
    let mut rgba = Vec::with_capacity(rgba_length);
    match frame.color_type {
        png::ColorType::Grayscale => {
            for value in source {
                rgba.extend_from_slice(&[*value, *value, *value, 255]);
            }
        }
        png::ColorType::GrayscaleAlpha => {
            for pixel in source.chunks_exact(2) {
                rgba.extend_from_slice(&[pixel[0], pixel[0], pixel[0], pixel[1]]);
            }
        }
        png::ColorType::Rgb => {
            for pixel in source.chunks_exact(3) {
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
