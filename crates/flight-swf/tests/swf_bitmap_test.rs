use std::sync::{Arc, Mutex};

use flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND;
use flight_compression::{
    CompressionFraming, HostDecompressDeflateCapability, SDK_HOST_DECOMPRESS_DEFLATE,
};
use flight_image::create_embedded_image_resource_reference;
use flight_image_codec::DecodedImage;
use flight_swf::contract::*;
use flight_texture::{AlphaType, PixelFormat, TextureGamut};

use crate::support::bytes_ref;

mod create_swf_jpeg_alpha_bitmap {
    use super::*;

    #[test]
    fn rejects_decoded_dimensions_that_differ_from_the_retained_dimensions() {
        let payload = jpeg_alpha_payload(2, 1, &[0, 0xff]);
        assert!(
            create_swf_jpeg_alpha_bitmap(
                &decoded_image(1, 1),
                &payload,
                &SDK_HOST_DECOMPRESS_DEFLATE,
            )
            .is_none()
        );
        assert!(
            create_swf_jpeg_alpha_bitmap(
                &decoded_image(2, 2),
                &payload,
                &SDK_HOST_DECOMPRESS_DEFLATE,
            )
            .is_none()
        );
    }

    #[test]
    fn rejects_short_and_long_decompressed_alpha_planes() {
        let decoded = decoded_image(2, 1);
        assert!(
            create_swf_jpeg_alpha_bitmap(
                &decoded,
                &jpeg_alpha_payload(2, 1, &[0]),
                &SDK_HOST_DECOMPRESS_DEFLATE,
            )
            .is_none()
        );
        assert!(
            create_swf_jpeg_alpha_bitmap(
                &decoded,
                &jpeg_alpha_payload(2, 1, &[0, 0x80, 0xff]),
                &SDK_HOST_DECOMPRESS_DEFLATE,
            )
            .is_none()
        );
    }

    #[test]
    fn replaces_the_alpha_plane_while_preserving_straight_rgb() {
        let decoded = DecodedImage {
            data: vec![
                0x11, 0x12, 0x13, 0xaa, 0x21, 0x22, 0x23, 0xbb, 0x31, 0x32, 0x33, 0xcc,
            ]
            .into_boxed_slice(),
            height: 1,
            width: 3,
        };
        let bitmap = create_swf_jpeg_alpha_bitmap(
            &decoded,
            &jpeg_alpha_payload(3, 1, &[0, 0x80, 0xff]),
            &SDK_HOST_DECOMPRESS_DEFLATE,
        )
        .unwrap();
        assert_eq!(bitmap.alpha_type, AlphaType::Straight);
        assert_eq!(bitmap.format, PixelFormat::Rgba8Unorm);
        assert_eq!(bitmap.gamut, TextureGamut::Srgb);
        assert_eq!(bitmap.height, 1);
        assert_eq!(bitmap.kind, BITMAP_TEXTURE_SOURCE_KIND);
        assert_eq!(bitmap.width, 3);
        assert_eq!(
            &*bitmap.data,
            &[
                0x11, 0x12, 0x13, 0, 0x21, 0x22, 0x23, 0x80, 0x31, 0x32, 0x33, 0xff
            ]
        );
    }
}

mod create_swf_lossless_bitmap {
    use super::*;

    #[test]
    fn bounds_expansion_to_the_exact_row_layout_and_requests_zlib_framing() {
        let seen = Arc::new(Mutex::new(None));
        let callback_seen = seen.clone();
        let deflate = HostDecompressDeflateCapability {
            decompress: Arc::new(move |_compressed, uncompressed_length, framing| {
                *callback_seen.lock().unwrap() = Some((uncompressed_length, framing));
                Some(vec![0; uncompressed_length].into_boxed_slice())
            }),
        };
        assert!(create_swf_lossless_bitmap(&payload(5, 3, 1, &[0]), false, &deflate).is_some());
        assert_eq!(
            *seen.lock().unwrap(),
            Some((12, CompressionFraming::Rfc1950))
        );
    }

    #[test]
    fn reads_the_alpha_form_as_premultiplied() {
        let bitmap = create_swf_lossless_bitmap(
            &payload(5, 1, 1, &stored(&[0x80, 0x40, 0x20, 0x10])),
            true,
            &SDK_HOST_DECOMPRESS_DEFLATE,
        )
        .unwrap();
        assert_eq!(&*bitmap.data, &[0x40, 0x20, 0x10, 0x80]);
        assert_eq!(bitmap.alpha_type, AlphaType::Premultiplied);
    }

    #[test]
    fn rejects_payloads_whose_pixels_run_short() {
        assert!(
            create_swf_lossless_bitmap(
                &payload(5, 64, 64, &stored(&[0, 1, 2, 3])),
                false,
                &SDK_HOST_DECOMPRESS_DEFLATE,
            )
            .is_none()
        );
        assert!(
            create_swf_lossless_bitmap(&[5, 1], false, &SDK_HOST_DECOMPRESS_DEFLATE,).is_none()
        );
    }

    #[test]
    fn resolves_color_mapped_pixels_through_the_preceding_table() {
        let body = [0x01, 0x02, 0x03, 0xfe, 0xfd, 0xfc, 1, 0, 0, 0];
        let bitmap = create_swf_lossless_bitmap(
            &payload_with_table(3, 2, 1, 2, &stored(&body)),
            false,
            &SDK_HOST_DECOMPRESS_DEFLATE,
        )
        .unwrap();
        assert_eq!(
            &bitmap.data[..8],
            &[0xfe, 0xfd, 0xfc, 0xff, 0x01, 0x02, 0x03, 0xff]
        );
    }

    #[test]
    fn scales_fifteen_bit_channels_to_the_full_byte_range() {
        let bitmap = create_swf_lossless_bitmap(
            &payload(4, 1, 1, &stored(&[0x7f, 0xff, 0, 0])),
            false,
            &SDK_HOST_DECOMPRESS_DEFLATE,
        )
        .unwrap();
        assert_eq!(&*bitmap.data, &[0xff, 0xff, 0xff, 0xff]);
    }

    #[test]
    fn unpacks_a_twenty_four_bit_image_without_padding_bytes() {
        let bitmap = create_swf_lossless_bitmap(
            &payload(
                5,
                2,
                1,
                &stored(&[0, 0x11, 0x22, 0x33, 0, 0x44, 0x55, 0x66]),
            ),
            false,
            &SDK_HOST_DECOMPRESS_DEFLATE,
        )
        .unwrap();
        assert_eq!(bitmap.width, 2);
        assert_eq!(
            &*bitmap.data,
            &[0x11, 0x22, 0x33, 0xff, 0x44, 0x55, 0x66, 0xff]
        );
        assert_eq!(bitmap.alpha_type, AlphaType::Opaque);
    }

    #[test]
    fn zero_fills_color_table_indices_beyond_the_decompressed_payload() {
        let opaque = create_swf_lossless_bitmap(
            &payload_with_table(3, 1, 1, 1, &stored(&[0x10, 0x20, 0x30, 0xff, 0, 0, 0])),
            false,
            &SDK_HOST_DECOMPRESS_DEFLATE,
        )
        .unwrap();
        assert_eq!(&*opaque.data, &[0, 0, 0, 0xff]);

        let alpha = create_swf_lossless_bitmap(
            &payload_with_table(
                3,
                1,
                1,
                1,
                &stored(&[0x10, 0x20, 0x30, 0x40, 0xff, 0, 0, 0]),
            ),
            true,
            &SDK_HOST_DECOMPRESS_DEFLATE,
        )
        .unwrap();
        assert_eq!(&*alpha.data, &[0, 0, 0, 0]);
    }
}

fn decoded_image(width: usize, height: usize) -> DecodedImage {
    return DecodedImage {
        data: vec![0; width * height * 4].into_boxed_slice(),
        height,
        width,
    };
}

fn jpeg_alpha_payload(width: u32, height: u32, alpha: &[u8]) -> SwfJpegAlphaPayload {
    let reference = create_embedded_image_resource_reference(bytes_ref(vec![0xff, 0xd8]));
    reference.write().unwrap().mime_type = Some("image/jpeg".to_string());
    return SwfJpegAlphaPayload {
        character_id: 1,
        compressed_alpha_bytes: stored(alpha).into_boxed_slice(),
        deblocking_parameter_raw: None,
        height,
        reference,
        width,
    };
}

fn payload(format: u8, width: u16, height: u16, pixels: &[u8]) -> Vec<u8> {
    let mut result = vec![
        format,
        width as u8,
        (width >> 8) as u8,
        height as u8,
        (height >> 8) as u8,
    ];
    result.extend_from_slice(pixels);
    return result;
}

fn payload_with_table(
    format: u8,
    width: u16,
    height: u16,
    color_count: u8,
    pixels: &[u8],
) -> Vec<u8> {
    let mut result = payload(format, width, height, &[]);
    result.push(color_count - 1);
    result.extend_from_slice(pixels);
    return result;
}

fn stored(bytes: &[u8]) -> Vec<u8> {
    let length = bytes.len();
    let mut first = 1_u32;
    let mut second = 0_u32;
    for byte in bytes {
        first = (first + u32::from(*byte)) % 65_521;
        second = (second + first) % 65_521;
    }
    let adler = second << 16 | first;
    let mut result = vec![
        0x78,
        0x01,
        0x01,
        length as u8,
        (length >> 8) as u8,
        !(length as u8),
        !((length >> 8) as u8),
    ];
    result.extend_from_slice(bytes);
    result.extend_from_slice(&adler.to_be_bytes());
    return result;
}
