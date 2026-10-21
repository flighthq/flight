use flight_texture_formats::*;

const KTX2_IDENTIFIER: [u8; 12] = [
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];

fn create_ktx2(vk_format: u32, byte_length: u64, payload_bytes: usize) -> Vec<u8> {
    let mut bytes = vec![0; 104 + payload_bytes];
    bytes[..12].copy_from_slice(&KTX2_IDENTIFIER);
    set_u32(&mut bytes, 12, vk_format);
    set_u32(&mut bytes, 20, 1);
    set_u32(&mut bytes, 24, 1);
    set_u32(&mut bytes, 36, 1);
    set_u32(&mut bytes, 40, 1);
    set_u64(&mut bytes, 80, 104);
    set_u64(&mut bytes, 88, byte_length);
    set_u64(&mut bytes, 96, byte_length);
    return bytes;
}

fn set_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn set_u64(bytes: &mut [u8], offset: usize, value: u64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

mod explain_texture_container_parse {
    use super::*;

    #[test]
    fn distinguishes_unsupported_formats_from_invalid_structures() {
        assert_eq!(
            explain_texture_container_parse(&create_ktx2(999, 0, 0)),
            Some(TextureContainerParseExplanation {
                container: Some(TextureContainerKind::Ktx2),
                reason: TextureContainerParseFailureReason::FormatUnsupported,
            })
        );
        let mut basis = vec![0; 69];
        basis[..2].copy_from_slice(&[0x73, 0x42]);
        assert_eq!(
            explain_texture_container_parse(&basis),
            Some(TextureContainerParseExplanation {
                container: Some(TextureContainerKind::Basis),
                reason: TextureContainerParseFailureReason::StructureInvalid,
            })
        );
    }

    #[test]
    fn reports_a_level_range_that_overruns_the_bytes() {
        assert_eq!(
            explain_texture_container_parse(&create_ktx2(37, 8, 0)),
            Some(TextureContainerParseExplanation {
                container: Some(TextureContainerKind::Ktx2),
                reason: TextureContainerParseFailureReason::LevelRangeOutOfBounds,
            })
        );
    }

    #[test]
    fn reports_a_truncated_detected_header_for_each_container() {
        let cases: &[(TextureContainerKind, &[u8])] = &[
            (TextureContainerKind::Atf, b"ATF"),
            (TextureContainerKind::Basis, &[0x73, 0x42]),
            (TextureContainerKind::Dds, b"DDS "),
            (TextureContainerKind::Ktx2, &KTX2_IDENTIFIER),
        ];
        for (container, bytes) in cases {
            assert_eq!(
                explain_texture_container_parse(bytes),
                Some(TextureContainerParseExplanation {
                    container: Some(*container),
                    reason: TextureContainerParseFailureReason::HeaderTruncated,
                })
            );
        }
    }

    #[test]
    fn reports_an_unrecognized_container() {
        assert_eq!(
            explain_texture_container_parse(&[0, 1, 2, 3]),
            Some(TextureContainerParseExplanation {
                container: None,
                reason: TextureContainerParseFailureReason::ContainerUnrecognized,
            })
        );
    }

    #[test]
    fn returns_none_when_the_detected_container_parses() {
        assert_eq!(
            explain_texture_container_parse(&create_ktx2(37, 1, 1)),
            None
        );
    }
}
