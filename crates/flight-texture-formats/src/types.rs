use flight_entity::Uint8Array;

#[derive(Debug, PartialEq, Eq)]
pub struct ByteReader<'a> {
    pub view: &'a Uint8Array,
    pub offset: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureContainer {
    pub format: TextureContainerFormat,
    pub width: usize,
    pub height: usize,
    pub depth: usize,
    pub mip_levels: usize,
    pub layers: usize,
    pub faces: usize,
    pub supercompression: TextureContainerSupercompression,
    pub levels: Vec<TextureContainerLevel>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextureContainerFormat {
    Rgba8Unorm,
    Rgba8Srgb,
    Bgra8Unorm,
    Bgra8Srgb,
    R8Unorm,
    Rg8Unorm,
    Rgba16f,
    Rgba32f,
    Bc1,
    Bc1Srgb,
    Bc2,
    Bc2Srgb,
    Bc3,
    Bc3Srgb,
    Bc4,
    Bc4Snorm,
    Bc5,
    Bc5Snorm,
    Bc6hUfloat,
    Bc6hSfloat,
    Bc7,
    Bc7Srgb,
    Etc1,
    Etc2Rgb,
    Etc2RgbSrgb,
    Etc2Rgba,
    Etc2RgbaSrgb,
    Etc2RgbA1,
    Etc2RgbA1Srgb,
    EacR11,
    EacR11Snorm,
    EacRg11,
    EacRg11Snorm,
    Pvrtc2bppRgb,
    Pvrtc2bppRgba,
    Pvrtc4bppRgb,
    Pvrtc4bppRgba,
    Astc4x4,
    Astc5x4,
    Astc5x5,
    Astc6x5,
    Astc6x6,
    Astc8x5,
    Astc8x6,
    Astc8x8,
    Astc10x5,
    Astc10x6,
    Astc10x8,
    Astc10x10,
    Astc12x10,
    Astc12x12,
    Etc1s,
    Uastc,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextureContainerKind {
    Atf,
    Basis,
    Dds,
    Ktx2,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextureContainerLevel {
    pub byte_offset: usize,
    pub byte_length: usize,
    pub width: usize,
    pub height: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextureContainerParseExplanation {
    pub container: Option<TextureContainerKind>,
    pub reason: TextureContainerParseFailureReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextureContainerParseFailureReason {
    ContainerUnrecognized,
    FormatUnsupported,
    HeaderTruncated,
    LevelRangeOutOfBounds,
    StructureInvalid,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TextureContainerSupercompression {
    None,
    BasisLz,
    Zstd,
    Zlib,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureContainerLevels {
    pub levels: Vec<TextureContainerLevel>,
    pub end_offset: usize,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerFormat string union; @flighthq/types exports the union only
pub fn get_texture_container_format_string(value: TextureContainerFormat) -> &'static str {
    return match value {
        TextureContainerFormat::Rgba8Unorm => "rgba8unorm",
        TextureContainerFormat::Rgba8Srgb => "rgba8Srgb",
        TextureContainerFormat::Bgra8Unorm => "bgra8unorm",
        TextureContainerFormat::Bgra8Srgb => "bgra8Srgb",
        TextureContainerFormat::R8Unorm => "r8unorm",
        TextureContainerFormat::Rg8Unorm => "rg8unorm",
        TextureContainerFormat::Rgba16f => "rgba16f",
        TextureContainerFormat::Rgba32f => "rgba32f",
        TextureContainerFormat::Bc1 => "bc1",
        TextureContainerFormat::Bc1Srgb => "bc1Srgb",
        TextureContainerFormat::Bc2 => "bc2",
        TextureContainerFormat::Bc2Srgb => "bc2Srgb",
        TextureContainerFormat::Bc3 => "bc3",
        TextureContainerFormat::Bc3Srgb => "bc3Srgb",
        TextureContainerFormat::Bc4 => "bc4",
        TextureContainerFormat::Bc4Snorm => "bc4Snorm",
        TextureContainerFormat::Bc5 => "bc5",
        TextureContainerFormat::Bc5Snorm => "bc5Snorm",
        TextureContainerFormat::Bc6hUfloat => "bc6hUfloat",
        TextureContainerFormat::Bc6hSfloat => "bc6hSfloat",
        TextureContainerFormat::Bc7 => "bc7",
        TextureContainerFormat::Bc7Srgb => "bc7Srgb",
        TextureContainerFormat::Etc1 => "etc1",
        TextureContainerFormat::Etc2Rgb => "etc2Rgb",
        TextureContainerFormat::Etc2RgbSrgb => "etc2RgbSrgb",
        TextureContainerFormat::Etc2Rgba => "etc2Rgba",
        TextureContainerFormat::Etc2RgbaSrgb => "etc2RgbaSrgb",
        TextureContainerFormat::Etc2RgbA1 => "etc2RgbA1",
        TextureContainerFormat::Etc2RgbA1Srgb => "etc2RgbA1Srgb",
        TextureContainerFormat::EacR11 => "eacR11",
        TextureContainerFormat::EacR11Snorm => "eacR11Snorm",
        TextureContainerFormat::EacRg11 => "eacRg11",
        TextureContainerFormat::EacRg11Snorm => "eacRg11Snorm",
        TextureContainerFormat::Pvrtc2bppRgb => "pvrtc2bppRgb",
        TextureContainerFormat::Pvrtc2bppRgba => "pvrtc2bppRgba",
        TextureContainerFormat::Pvrtc4bppRgb => "pvrtc4bppRgb",
        TextureContainerFormat::Pvrtc4bppRgba => "pvrtc4bppRgba",
        TextureContainerFormat::Astc4x4 => "astc4x4",
        TextureContainerFormat::Astc5x4 => "astc5x4",
        TextureContainerFormat::Astc5x5 => "astc5x5",
        TextureContainerFormat::Astc6x5 => "astc6x5",
        TextureContainerFormat::Astc6x6 => "astc6x6",
        TextureContainerFormat::Astc8x5 => "astc8x5",
        TextureContainerFormat::Astc8x6 => "astc8x6",
        TextureContainerFormat::Astc8x8 => "astc8x8",
        TextureContainerFormat::Astc10x5 => "astc10x5",
        TextureContainerFormat::Astc10x6 => "astc10x6",
        TextureContainerFormat::Astc10x8 => "astc10x8",
        TextureContainerFormat::Astc10x10 => "astc10x10",
        TextureContainerFormat::Astc12x10 => "astc12x10",
        TextureContainerFormat::Astc12x12 => "astc12x12",
        TextureContainerFormat::Etc1s => "etc1s",
        TextureContainerFormat::Uastc => "uastc",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerKind string union; @flighthq/types exports the union only
pub fn get_texture_container_kind_string(value: TextureContainerKind) -> &'static str {
    return match value {
        TextureContainerKind::Atf => "atf",
        TextureContainerKind::Basis => "basis",
        TextureContainerKind::Dds => "dds",
        TextureContainerKind::Ktx2 => "ktx2",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerParseFailureReason string union; @flighthq/types exports the union only
pub fn get_texture_container_parse_failure_reason_string(
    value: TextureContainerParseFailureReason,
) -> &'static str {
    return match value {
        TextureContainerParseFailureReason::ContainerUnrecognized => "container-unrecognized",
        TextureContainerParseFailureReason::FormatUnsupported => "format-unsupported",
        TextureContainerParseFailureReason::HeaderTruncated => "header-truncated",
        TextureContainerParseFailureReason::LevelRangeOutOfBounds => "level-range-out-of-bounds",
        TextureContainerParseFailureReason::StructureInvalid => "structure-invalid",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerSupercompression string union; @flighthq/types exports the union only
pub fn get_texture_container_supercompression_string(
    value: TextureContainerSupercompression,
) -> &'static str {
    return match value {
        TextureContainerSupercompression::None => "None",
        TextureContainerSupercompression::BasisLz => "BasisLZ",
        TextureContainerSupercompression::Zstd => "Zstd",
        TextureContainerSupercompression::Zlib => "ZLIB",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerFormat string union; @flighthq/types exports the union only
pub fn parse_texture_container_format(value: &str) -> Option<TextureContainerFormat> {
    return match value {
        "rgba8unorm" => Some(TextureContainerFormat::Rgba8Unorm),
        "rgba8Srgb" => Some(TextureContainerFormat::Rgba8Srgb),
        "bgra8unorm" => Some(TextureContainerFormat::Bgra8Unorm),
        "bgra8Srgb" => Some(TextureContainerFormat::Bgra8Srgb),
        "r8unorm" => Some(TextureContainerFormat::R8Unorm),
        "rg8unorm" => Some(TextureContainerFormat::Rg8Unorm),
        "rgba16f" => Some(TextureContainerFormat::Rgba16f),
        "rgba32f" => Some(TextureContainerFormat::Rgba32f),
        "bc1" => Some(TextureContainerFormat::Bc1),
        "bc1Srgb" => Some(TextureContainerFormat::Bc1Srgb),
        "bc2" => Some(TextureContainerFormat::Bc2),
        "bc2Srgb" => Some(TextureContainerFormat::Bc2Srgb),
        "bc3" => Some(TextureContainerFormat::Bc3),
        "bc3Srgb" => Some(TextureContainerFormat::Bc3Srgb),
        "bc4" => Some(TextureContainerFormat::Bc4),
        "bc4Snorm" => Some(TextureContainerFormat::Bc4Snorm),
        "bc5" => Some(TextureContainerFormat::Bc5),
        "bc5Snorm" => Some(TextureContainerFormat::Bc5Snorm),
        "bc6hUfloat" => Some(TextureContainerFormat::Bc6hUfloat),
        "bc6hSfloat" => Some(TextureContainerFormat::Bc6hSfloat),
        "bc7" => Some(TextureContainerFormat::Bc7),
        "bc7Srgb" => Some(TextureContainerFormat::Bc7Srgb),
        "etc1" => Some(TextureContainerFormat::Etc1),
        "etc2Rgb" => Some(TextureContainerFormat::Etc2Rgb),
        "etc2RgbSrgb" => Some(TextureContainerFormat::Etc2RgbSrgb),
        "etc2Rgba" => Some(TextureContainerFormat::Etc2Rgba),
        "etc2RgbaSrgb" => Some(TextureContainerFormat::Etc2RgbaSrgb),
        "etc2RgbA1" => Some(TextureContainerFormat::Etc2RgbA1),
        "etc2RgbA1Srgb" => Some(TextureContainerFormat::Etc2RgbA1Srgb),
        "eacR11" => Some(TextureContainerFormat::EacR11),
        "eacR11Snorm" => Some(TextureContainerFormat::EacR11Snorm),
        "eacRg11" => Some(TextureContainerFormat::EacRg11),
        "eacRg11Snorm" => Some(TextureContainerFormat::EacRg11Snorm),
        "pvrtc2bppRgb" => Some(TextureContainerFormat::Pvrtc2bppRgb),
        "pvrtc2bppRgba" => Some(TextureContainerFormat::Pvrtc2bppRgba),
        "pvrtc4bppRgb" => Some(TextureContainerFormat::Pvrtc4bppRgb),
        "pvrtc4bppRgba" => Some(TextureContainerFormat::Pvrtc4bppRgba),
        "astc4x4" => Some(TextureContainerFormat::Astc4x4),
        "astc5x4" => Some(TextureContainerFormat::Astc5x4),
        "astc5x5" => Some(TextureContainerFormat::Astc5x5),
        "astc6x5" => Some(TextureContainerFormat::Astc6x5),
        "astc6x6" => Some(TextureContainerFormat::Astc6x6),
        "astc8x5" => Some(TextureContainerFormat::Astc8x5),
        "astc8x6" => Some(TextureContainerFormat::Astc8x6),
        "astc8x8" => Some(TextureContainerFormat::Astc8x8),
        "astc10x5" => Some(TextureContainerFormat::Astc10x5),
        "astc10x6" => Some(TextureContainerFormat::Astc10x6),
        "astc10x8" => Some(TextureContainerFormat::Astc10x8),
        "astc10x10" => Some(TextureContainerFormat::Astc10x10),
        "astc12x10" => Some(TextureContainerFormat::Astc12x10),
        "astc12x12" => Some(TextureContainerFormat::Astc12x12),
        "etc1s" => Some(TextureContainerFormat::Etc1s),
        "uastc" => Some(TextureContainerFormat::Uastc),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerKind string union; @flighthq/types exports the union only
pub fn parse_texture_container_kind(value: &str) -> Option<TextureContainerKind> {
    return match value {
        "atf" => Some(TextureContainerKind::Atf),
        "basis" => Some(TextureContainerKind::Basis),
        "dds" => Some(TextureContainerKind::Dds),
        "ktx2" => Some(TextureContainerKind::Ktx2),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerParseFailureReason string union; @flighthq/types exports the union only
pub fn parse_texture_container_parse_failure_reason(
    value: &str,
) -> Option<TextureContainerParseFailureReason> {
    return match value {
        "container-unrecognized" => Some(TextureContainerParseFailureReason::ContainerUnrecognized),
        "format-unsupported" => Some(TextureContainerParseFailureReason::FormatUnsupported),
        "header-truncated" => Some(TextureContainerParseFailureReason::HeaderTruncated),
        "level-range-out-of-bounds" => {
            Some(TextureContainerParseFailureReason::LevelRangeOutOfBounds)
        }
        "structure-invalid" => Some(TextureContainerParseFailureReason::StructureInvalid),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS TextureContainerSupercompression string union; @flighthq/types exports the union only
pub fn parse_texture_container_supercompression(
    value: &str,
) -> Option<TextureContainerSupercompression> {
    return match value {
        "None" => Some(TextureContainerSupercompression::None),
        "BasisLZ" => Some(TextureContainerSupercompression::BasisLz),
        "Zstd" => Some(TextureContainerSupercompression::Zstd),
        "ZLIB" => Some(TextureContainerSupercompression::Zlib),
        _ => None,
    };
}
