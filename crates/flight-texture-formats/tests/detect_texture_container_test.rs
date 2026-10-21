use flight_texture_formats::*;

mod detect_texture_container {
    use super::*;

    const KTX2_MAGIC: [u8; 12] = [
        0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
    ];

    #[test]
    fn does_not_mistake_a_truncated_ktx2_identifier_for_ktx2() {
        assert_eq!(detect_texture_container(&KTX2_MAGIC[..8]), None);
    }

    #[test]
    fn returns_none_for_an_unrecognized_or_too_short_buffer() {
        assert_eq!(detect_texture_container(&[0x89, 0x50, 0x4e, 0x47]), None);
        assert_eq!(detect_texture_container(&[0x73]), None);
        assert_eq!(detect_texture_container(&[]), None);
    }

    #[test]
    fn sniffs_the_atf_signature() {
        assert_eq!(
            detect_texture_container(b"ATF\0\0\0"),
            Some(TextureContainerKind::Atf)
        );
    }

    #[test]
    fn sniffs_the_basis_signature() {
        assert_eq!(
            detect_texture_container(&[0x73, 0x42, 0, 0]),
            Some(TextureContainerKind::Basis)
        );
    }

    #[test]
    fn sniffs_the_dds_magic() {
        assert_eq!(
            detect_texture_container(b"DDS \0\0"),
            Some(TextureContainerKind::Dds)
        );
    }

    #[test]
    fn sniffs_the_ktx2_identifier() {
        let mut bytes = KTX2_MAGIC.to_vec();
        bytes.extend([0; 4]);
        assert_eq!(
            detect_texture_container(&bytes),
            Some(TextureContainerKind::Ktx2)
        );
    }
}
