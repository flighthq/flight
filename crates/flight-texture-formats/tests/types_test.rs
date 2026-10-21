use flight_texture_formats::contract::*;

mod get_texture_container_format_string {
    use super::*;

    #[test]
    fn preserves_every_exact_source_string() {
        for (format, expected) in FORMATS {
            assert_eq!(get_texture_container_format_string(*format), *expected);
        }
    }
}

mod get_texture_container_kind_string {
    use super::*;

    #[test]
    fn preserves_every_exact_source_string() {
        assert_eq!(
            get_texture_container_kind_string(TextureContainerKind::Atf),
            "atf"
        );
        assert_eq!(
            get_texture_container_kind_string(TextureContainerKind::Basis),
            "basis"
        );
        assert_eq!(
            get_texture_container_kind_string(TextureContainerKind::Dds),
            "dds"
        );
        assert_eq!(
            get_texture_container_kind_string(TextureContainerKind::Ktx2),
            "ktx2"
        );
    }
}

mod get_texture_container_parse_failure_reason_string {
    use super::*;

    #[test]
    fn preserves_every_exact_source_string() {
        assert_eq!(
            get_texture_container_parse_failure_reason_string(
                TextureContainerParseFailureReason::ContainerUnrecognized
            ),
            "container-unrecognized"
        );
        assert_eq!(
            get_texture_container_parse_failure_reason_string(
                TextureContainerParseFailureReason::FormatUnsupported
            ),
            "format-unsupported"
        );
        assert_eq!(
            get_texture_container_parse_failure_reason_string(
                TextureContainerParseFailureReason::HeaderTruncated
            ),
            "header-truncated"
        );
        assert_eq!(
            get_texture_container_parse_failure_reason_string(
                TextureContainerParseFailureReason::LevelRangeOutOfBounds
            ),
            "level-range-out-of-bounds"
        );
        assert_eq!(
            get_texture_container_parse_failure_reason_string(
                TextureContainerParseFailureReason::StructureInvalid
            ),
            "structure-invalid"
        );
    }
}

mod get_texture_container_supercompression_string {
    use super::*;

    #[test]
    fn preserves_every_exact_source_string() {
        assert_eq!(
            get_texture_container_supercompression_string(TextureContainerSupercompression::None),
            "None"
        );
        assert_eq!(
            get_texture_container_supercompression_string(
                TextureContainerSupercompression::BasisLz
            ),
            "BasisLZ"
        );
        assert_eq!(
            get_texture_container_supercompression_string(TextureContainerSupercompression::Zstd),
            "Zstd"
        );
        assert_eq!(
            get_texture_container_supercompression_string(TextureContainerSupercompression::Zlib),
            "ZLIB"
        );
    }
}

mod parse_texture_container_format {
    use super::*;

    #[test]
    fn parses_every_exact_source_string_and_rejects_unknown_values() {
        for (expected, value) in FORMATS {
            assert_eq!(parse_texture_container_format(value), Some(*expected));
        }
        assert_eq!(parse_texture_container_format("BC1"), None);
    }
}

mod parse_texture_container_kind {
    use super::*;

    #[test]
    fn parses_exact_source_strings_and_rejects_unknown_values() {
        assert_eq!(
            parse_texture_container_kind("atf"),
            Some(TextureContainerKind::Atf)
        );
        assert_eq!(
            parse_texture_container_kind("basis"),
            Some(TextureContainerKind::Basis)
        );
        assert_eq!(
            parse_texture_container_kind("dds"),
            Some(TextureContainerKind::Dds)
        );
        assert_eq!(
            parse_texture_container_kind("ktx2"),
            Some(TextureContainerKind::Ktx2)
        );
        assert_eq!(parse_texture_container_kind("KTX2"), None);
    }
}

mod parse_texture_container_parse_failure_reason {
    use super::*;

    #[test]
    fn parses_exact_source_strings_and_rejects_unknown_values() {
        for reason in [
            TextureContainerParseFailureReason::ContainerUnrecognized,
            TextureContainerParseFailureReason::FormatUnsupported,
            TextureContainerParseFailureReason::HeaderTruncated,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
            TextureContainerParseFailureReason::StructureInvalid,
        ] {
            assert_eq!(
                parse_texture_container_parse_failure_reason(
                    get_texture_container_parse_failure_reason_string(reason)
                ),
                Some(reason)
            );
        }
        assert_eq!(
            parse_texture_container_parse_failure_reason("invalid"),
            None
        );
    }
}

mod parse_texture_container_supercompression {
    use super::*;

    #[test]
    fn parses_exact_source_strings_and_rejects_unknown_values() {
        for value in [
            TextureContainerSupercompression::None,
            TextureContainerSupercompression::BasisLz,
            TextureContainerSupercompression::Zstd,
            TextureContainerSupercompression::Zlib,
        ] {
            assert_eq!(
                parse_texture_container_supercompression(
                    get_texture_container_supercompression_string(value)
                ),
                Some(value)
            );
        }
        assert_eq!(parse_texture_container_supercompression("zlib"), None);
    }
}

const FORMATS: &[(TextureContainerFormat, &str)] = &[
    (TextureContainerFormat::Rgba8Unorm, "rgba8unorm"),
    (TextureContainerFormat::Rgba8Srgb, "rgba8Srgb"),
    (TextureContainerFormat::Bgra8Unorm, "bgra8unorm"),
    (TextureContainerFormat::Bgra8Srgb, "bgra8Srgb"),
    (TextureContainerFormat::R8Unorm, "r8unorm"),
    (TextureContainerFormat::Rg8Unorm, "rg8unorm"),
    (TextureContainerFormat::Rgba16f, "rgba16f"),
    (TextureContainerFormat::Rgba32f, "rgba32f"),
    (TextureContainerFormat::Bc1, "bc1"),
    (TextureContainerFormat::Bc1Srgb, "bc1Srgb"),
    (TextureContainerFormat::Bc2, "bc2"),
    (TextureContainerFormat::Bc2Srgb, "bc2Srgb"),
    (TextureContainerFormat::Bc3, "bc3"),
    (TextureContainerFormat::Bc3Srgb, "bc3Srgb"),
    (TextureContainerFormat::Bc4, "bc4"),
    (TextureContainerFormat::Bc4Snorm, "bc4Snorm"),
    (TextureContainerFormat::Bc5, "bc5"),
    (TextureContainerFormat::Bc5Snorm, "bc5Snorm"),
    (TextureContainerFormat::Bc6hUfloat, "bc6hUfloat"),
    (TextureContainerFormat::Bc6hSfloat, "bc6hSfloat"),
    (TextureContainerFormat::Bc7, "bc7"),
    (TextureContainerFormat::Bc7Srgb, "bc7Srgb"),
    (TextureContainerFormat::Etc1, "etc1"),
    (TextureContainerFormat::Etc2Rgb, "etc2Rgb"),
    (TextureContainerFormat::Etc2RgbSrgb, "etc2RgbSrgb"),
    (TextureContainerFormat::Etc2Rgba, "etc2Rgba"),
    (TextureContainerFormat::Etc2RgbaSrgb, "etc2RgbaSrgb"),
    (TextureContainerFormat::Etc2RgbA1, "etc2RgbA1"),
    (TextureContainerFormat::Etc2RgbA1Srgb, "etc2RgbA1Srgb"),
    (TextureContainerFormat::EacR11, "eacR11"),
    (TextureContainerFormat::EacR11Snorm, "eacR11Snorm"),
    (TextureContainerFormat::EacRg11, "eacRg11"),
    (TextureContainerFormat::EacRg11Snorm, "eacRg11Snorm"),
    (TextureContainerFormat::Pvrtc2bppRgb, "pvrtc2bppRgb"),
    (TextureContainerFormat::Pvrtc2bppRgba, "pvrtc2bppRgba"),
    (TextureContainerFormat::Pvrtc4bppRgb, "pvrtc4bppRgb"),
    (TextureContainerFormat::Pvrtc4bppRgba, "pvrtc4bppRgba"),
    (TextureContainerFormat::Astc4x4, "astc4x4"),
    (TextureContainerFormat::Astc5x4, "astc5x4"),
    (TextureContainerFormat::Astc5x5, "astc5x5"),
    (TextureContainerFormat::Astc6x5, "astc6x5"),
    (TextureContainerFormat::Astc6x6, "astc6x6"),
    (TextureContainerFormat::Astc8x5, "astc8x5"),
    (TextureContainerFormat::Astc8x6, "astc8x6"),
    (TextureContainerFormat::Astc8x8, "astc8x8"),
    (TextureContainerFormat::Astc10x5, "astc10x5"),
    (TextureContainerFormat::Astc10x6, "astc10x6"),
    (TextureContainerFormat::Astc10x8, "astc10x8"),
    (TextureContainerFormat::Astc10x10, "astc10x10"),
    (TextureContainerFormat::Astc12x10, "astc12x10"),
    (TextureContainerFormat::Astc12x12, "astc12x12"),
    (TextureContainerFormat::Etc1s, "etc1s"),
    (TextureContainerFormat::Uastc, "uastc"),
];
