use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_image_codec::ImageDecodeOptions;
use flight_swf::*;

use crate::support::block_on;

mod decode_swf_image {
    use super::*;

    #[test]
    fn decodes_both_container_native_lossless_mime_types() {
        let payload = lossless_payload(5, 1, 1, &stored(&[0x80, 0x40, 0x20, 0x10]));
        assert!(
            block_on(decode_swf_image(
                &payload,
                SWF_LOSSLESS_MIME_TYPE,
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None,
            ))
            .is_some()
        );
        assert!(
            block_on(decode_swf_image(
                &payload,
                SWF_LOSSLESS_ALPHA_MIME_TYPE,
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None,
            ))
            .is_some()
        );
    }

    #[test]
    fn retains_premultiplied_pixels_on_request_and_defaults_to_straight() {
        let payload = lossless_payload(5, 1, 1, &stored(&[0x80, 0x40, 0x20, 0x10]));
        let options = ImageDecodeOptions {
            premultiply_alpha: Some(true),
        };
        let premultiplied = block_on(decode_swf_image(
            &payload,
            SWF_LOSSLESS_ALPHA_MIME_TYPE,
            &SDK_HOST_DECOMPRESS_DEFLATE,
            Some(&options),
        ))
        .unwrap();
        let straight = block_on(decode_swf_image(
            &payload,
            SWF_LOSSLESS_ALPHA_MIME_TYPE,
            &SDK_HOST_DECOMPRESS_DEFLATE,
            None,
        ))
        .unwrap();
        assert_eq!(&*premultiplied.data, &[0x40, 0x20, 0x10, 0x80]);
        assert_eq!(&*straight.data, &[0x80, 0x40, 0x20, 0x80]);
    }

    #[test]
    fn returns_null_for_unrecognized_mime_types() {
        let payload = lossless_payload(5, 1, 1, &stored(&[0x80, 0x40, 0x20, 0x10]));
        assert!(
            block_on(decode_swf_image(
                &payload,
                "image/png",
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None,
            ))
            .is_none()
        );
    }
}

fn lossless_payload(format: u8, width: u16, height: u16, pixels: &[u8]) -> Vec<u8> {
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
