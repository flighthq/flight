use std::sync::Arc;

use crate::support::{
    TAG_END, TAG_SHOW_FRAME, bytes_ref, create_swf, create_tag, join_bytes, uint32,
};
use flight_compression::{
    CompressionFraming, HostDecompressDeflateCapability, SDK_HOST_DECOMPRESS_DEFLATE,
};
use flight_swf::contract::*;

mod parse_swf_header {
    use super::*;

    #[test]
    fn clamps_inverted_stage_extents_consistently_with_the_importer() {
        let source = create_swf(&[create_tag(TAG_END, &[])], 24.0, [2000, 0, 1000, 0]);
        assert_eq!(
            parse_swf_header(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap()
                .stage_bounds,
            SwfTagRectangle {
                height: 0.0,
                width: 0.0,
                x: 100.0,
                y: 50.0
            }
        );
    }

    #[test]
    fn preserves_a_fractional_fixed_frame_rate() {
        let source = create_swf(&[create_tag(TAG_END, &[])], 23.5, [0, 2000, 0, 1000]);
        assert_eq!(
            parse_swf_header(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap()
                .frame_rate,
            23.5
        );
    }

    #[test]
    fn reads_a_compressed_container_to_the_same_header() {
        let source = create_swf(
            &[create_tag(TAG_SHOW_FRAME, &[]), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let source_bytes = source.read().unwrap();
        let uncompressed_length = source_bytes.len() - 8;
        let mut body = source_bytes[8..].to_vec();
        body.reverse();
        let mut compressed = join_bytes(&[&source_bytes[..8], &body]);
        compressed[0] = 0x43;
        drop(source_bytes);
        let compressed = bytes_ref(compressed);
        assert!(parse_swf_header(&compressed, None, None).is_none());
        let reversing = HostDecompressDeflateCapability {
            decompress: Arc::new(move |body, requested_length, framing| {
                assert_eq!(framing, CompressionFraming::Rfc1950);
                assert_eq!(requested_length, uncompressed_length);
                let mut bytes = body.to_vec();
                bytes.reverse();
                Some(bytes.into_boxed_slice())
            }),
        };
        assert_eq!(
            parse_swf_header(&compressed, Some(&reversing), None),
            parse_swf_header(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
        );
    }

    #[test]
    fn reads_version_length_rate_and_stage_bounds() {
        let source = create_swf(&[create_tag(TAG_END, &[])], 24.0, [0, 2000, 0, 1000]);
        let header = parse_swf_header(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None).unwrap();
        assert_eq!(header.version, 9);
        assert_eq!(header.file_length as usize, source.read().unwrap().len());
        assert_eq!(header.frame_rate, 24.0);
        assert_eq!(
            (header.stage_bounds.width, header.stage_bounds.height),
            (100.0, 50.0)
        );
    }

    #[test]
    fn rejects_invalid_declared_lengths_and_a_zero_version() {
        let make = || create_swf(&[create_tag(TAG_END, &[])], 24.0, [0, 2000, 0, 1000]);
        let too_long = make();
        let length = too_long.read().unwrap().len();
        too_long.write().unwrap()[4..8].copy_from_slice(&uint32(length as u32 + 1));
        assert!(parse_swf_header(&too_long, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None).is_none());
        let too_short = make();
        too_short.write().unwrap()[4..8].copy_from_slice(&uint32(11));
        assert!(parse_swf_header(&too_short, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None).is_none());
        let zero = make();
        zero.write().unwrap()[3] = 0;
        assert!(parse_swf_header(&zero, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None).is_none());
    }

    #[test]
    fn returns_none_for_empty_input() {
        assert!(
            parse_swf_header(
                &bytes_ref(Vec::new()),
                Some(&SDK_HOST_DECOMPRESS_DEFLATE),
                None
            )
            .is_none()
        );
    }

    #[test]
    fn returns_none_for_input_too_small_to_be_valid() {
        assert!(
            parse_swf_header(
                &bytes_ref(vec![0x46, 0x57, 0x53]),
                Some(&SDK_HOST_DECOMPRESS_DEFLATE),
                None
            )
            .is_none()
        );
    }
}
