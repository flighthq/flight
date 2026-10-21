use flight_entity::Uint8Array;

use crate::byte_reader::{
    create_byte_reader, has_byte_reader_bytes, read_byte_reader_u32, read_byte_reader_u64,
    skip_byte_reader,
};
use crate::types::{
    TextureContainer, TextureContainerFormat, TextureContainerLevel,
    TextureContainerParseFailureReason, TextureContainerSupercompression,
};

pub fn get_ktx2_parse_failure_reason(
    bytes: &Uint8Array,
) -> Option<TextureContainerParseFailureReason> {
    let mut failure = None;
    let container = parse_ktx2_internal(bytes, &mut failure);
    return if container.is_none() { failure } else { None };
}

fn map_ktx2_format(vk_format: u32, supercompression_scheme: u32) -> Option<TextureContainerFormat> {
    if vk_format == 0 {
        return Some(if supercompression_scheme == 1 {
            TextureContainerFormat::Etc1s
        } else {
            TextureContainerFormat::Uastc
        });
    }
    return match vk_format {
        9 => Some(TextureContainerFormat::R8Unorm),
        16 => Some(TextureContainerFormat::Rg8Unorm),
        37 => Some(TextureContainerFormat::Rgba8Unorm),
        43 => Some(TextureContainerFormat::Rgba8Srgb),
        44 => Some(TextureContainerFormat::Bgra8Unorm),
        50 => Some(TextureContainerFormat::Bgra8Srgb),
        97 => Some(TextureContainerFormat::Rgba16f),
        109 => Some(TextureContainerFormat::Rgba32f),
        131 | 133 => Some(TextureContainerFormat::Bc1),
        132 | 134 => Some(TextureContainerFormat::Bc1Srgb),
        135 => Some(TextureContainerFormat::Bc2),
        136 => Some(TextureContainerFormat::Bc2Srgb),
        137 => Some(TextureContainerFormat::Bc3),
        138 => Some(TextureContainerFormat::Bc3Srgb),
        139 => Some(TextureContainerFormat::Bc4),
        140 => Some(TextureContainerFormat::Bc4Snorm),
        141 => Some(TextureContainerFormat::Bc5),
        142 => Some(TextureContainerFormat::Bc5Snorm),
        143 => Some(TextureContainerFormat::Bc6hUfloat),
        144 => Some(TextureContainerFormat::Bc6hSfloat),
        145 => Some(TextureContainerFormat::Bc7),
        146 => Some(TextureContainerFormat::Bc7Srgb),
        147 => Some(TextureContainerFormat::Etc2Rgb),
        148 => Some(TextureContainerFormat::Etc2RgbSrgb),
        149 => Some(TextureContainerFormat::Etc2RgbA1),
        150 => Some(TextureContainerFormat::Etc2RgbA1Srgb),
        151 => Some(TextureContainerFormat::Etc2Rgba),
        152 => Some(TextureContainerFormat::Etc2RgbaSrgb),
        153 => Some(TextureContainerFormat::EacR11),
        154 => Some(TextureContainerFormat::EacR11Snorm),
        155 => Some(TextureContainerFormat::EacRg11),
        156 => Some(TextureContainerFormat::EacRg11Snorm),
        157 | 158 => Some(TextureContainerFormat::Astc4x4),
        159 | 160 => Some(TextureContainerFormat::Astc5x4),
        161 | 162 => Some(TextureContainerFormat::Astc5x5),
        163 | 164 => Some(TextureContainerFormat::Astc6x5),
        165 | 166 => Some(TextureContainerFormat::Astc6x6),
        167 | 168 => Some(TextureContainerFormat::Astc8x5),
        169 | 170 => Some(TextureContainerFormat::Astc8x6),
        171 | 172 => Some(TextureContainerFormat::Astc8x8),
        173 | 174 => Some(TextureContainerFormat::Astc10x5),
        175 | 176 => Some(TextureContainerFormat::Astc10x6),
        177 | 178 => Some(TextureContainerFormat::Astc10x8),
        179 | 180 => Some(TextureContainerFormat::Astc10x10),
        181 | 182 => Some(TextureContainerFormat::Astc12x10),
        183 | 184 => Some(TextureContainerFormat::Astc12x12),
        _ => None,
    };
}

fn map_ktx2_supercompression(value: u32) -> Option<TextureContainerSupercompression> {
    return match value {
        0 => Some(TextureContainerSupercompression::None),
        1 => Some(TextureContainerSupercompression::BasisLz),
        2 => Some(TextureContainerSupercompression::Zstd),
        3 => Some(TextureContainerSupercompression::Zlib),
        _ => None,
    };
}

pub fn parse_ktx2(bytes: &Uint8Array) -> Option<TextureContainer> {
    return parse_ktx2_internal(bytes, &mut None);
}

fn parse_ktx2_internal(
    bytes: &Uint8Array,
    failure: &mut Option<TextureContainerParseFailureReason>,
) -> Option<TextureContainer> {
    if !bytes.starts_with(&KTX2_IDENTIFIER) {
        return reject(
            failure,
            TextureContainerParseFailureReason::ContainerUnrecognized,
        );
    }
    if bytes.len() < KTX2_LEVEL_INDEX_OFFSET {
        return reject(failure, TextureContainerParseFailureReason::HeaderTruncated);
    }

    let mut reader = create_byte_reader(bytes, Some(12));
    let vk_format = read_byte_reader_u32(&mut reader);
    skip_byte_reader(&mut reader, 4);
    let pixel_width = read_byte_reader_u32(&mut reader) as usize;
    let pixel_height = read_byte_reader_u32(&mut reader) as usize;
    let pixel_depth = read_byte_reader_u32(&mut reader) as usize;
    let layer_count = read_byte_reader_u32(&mut reader) as usize;
    let face_count = read_byte_reader_u32(&mut reader);
    let level_count = read_byte_reader_u32(&mut reader) as usize;
    let supercompression_scheme = read_byte_reader_u32(&mut reader);

    let Some(supercompression) = map_ktx2_supercompression(supercompression_scheme) else {
        return reject(
            failure,
            TextureContainerParseFailureReason::FormatUnsupported,
        );
    };
    let Some(format) = map_ktx2_format(vk_format, supercompression_scheme) else {
        return reject(
            failure,
            TextureContainerParseFailureReason::FormatUnsupported,
        );
    };

    let width = pixel_width.max(1);
    let height = pixel_height.max(1);
    let depth = pixel_depth.max(1);
    let layers = layer_count.max(1);
    let faces = if face_count == 6 { 6 } else { 1 };
    let level_count_present = level_count.max(1);
    reader.offset = KTX2_LEVEL_INDEX_OFFSET;
    let Some(index_length) = level_count_present.checked_mul(24) else {
        return reject(
            failure,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
        );
    };
    if !has_byte_reader_bytes(&reader, index_length) {
        return reject(
            failure,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
        );
    }

    let Some(images_per_level) = layers.checked_mul(faces) else {
        return reject(
            failure,
            TextureContainerParseFailureReason::StructureInvalid,
        );
    };
    let mut file_order_levels = Vec::new();
    for mip in 0..level_count_present {
        let byte_offset_u64 = read_byte_reader_u64(&mut reader);
        let byte_length_u64 = read_byte_reader_u64(&mut reader);
        skip_byte_reader(&mut reader, 8);
        if byte_offset_u64 > MAX_EXACT_JS_INTEGER || byte_length_u64 > MAX_EXACT_JS_INTEGER {
            return reject(
                failure,
                TextureContainerParseFailureReason::LevelRangeOutOfBounds,
            );
        }
        let Ok(byte_offset) = usize::try_from(byte_offset_u64) else {
            return reject(
                failure,
                TextureContainerParseFailureReason::LevelRangeOutOfBounds,
            );
        };
        let Ok(byte_length) = usize::try_from(byte_length_u64) else {
            return reject(
                failure,
                TextureContainerParseFailureReason::LevelRangeOutOfBounds,
            );
        };
        if byte_offset
            .checked_add(byte_length)
            .is_none_or(|end| end > bytes.len())
        {
            return reject(
                failure,
                TextureContainerParseFailureReason::LevelRangeOutOfBounds,
            );
        }

        let mip_width = shifted_dimension(width, mip);
        let mip_height = shifted_dimension(height, mip);
        let splittable = supercompression == TextureContainerSupercompression::None
            && images_per_level > 1
            && byte_length.is_multiple_of(images_per_level);
        if !splittable {
            file_order_levels.push(TextureContainerLevel {
                byte_length,
                byte_offset,
                height: mip_height,
                width: mip_width,
            });
            continue;
        }
        let image_size = byte_length / images_per_level;
        for image in 0..images_per_level {
            file_order_levels.push(TextureContainerLevel {
                byte_length: image_size,
                byte_offset: byte_offset + image * image_size,
                height: mip_height,
                width: mip_width,
            });
        }
    }

    let levels = if supercompression == TextureContainerSupercompression::None
        && images_per_level > 1
        && file_order_levels.len() == level_count_present * images_per_level
    {
        let mut canonical = Vec::with_capacity(file_order_levels.len());
        for image in 0..images_per_level {
            for mip in 0..level_count_present {
                canonical.push(file_order_levels[mip * images_per_level + image]);
            }
        }
        canonical
    } else {
        file_order_levels
    };

    return Some(TextureContainer {
        depth,
        faces,
        format,
        height,
        layers,
        levels,
        mip_levels: level_count_present,
        supercompression,
        width,
    });
}

fn reject(
    failure: &mut Option<TextureContainerParseFailureReason>,
    reason: TextureContainerParseFailureReason,
) -> Option<TextureContainer> {
    *failure = Some(reason);
    return None;
}

fn shifted_dimension(base: usize, shift: usize) -> usize {
    return if shift >= usize::BITS as usize {
        1
    } else {
        (base >> shift).max(1)
    };
}

const KTX2_IDENTIFIER: [u8; 12] = [
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];
const KTX2_LEVEL_INDEX_OFFSET: usize = 80;
const MAX_EXACT_JS_INTEGER: u64 = (1u64 << 53) - 1;
