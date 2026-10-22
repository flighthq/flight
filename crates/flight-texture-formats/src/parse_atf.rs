use flight_entity::Uint8Array;

use flight_buffer::{
    create_byte_reader, has_byte_reader_bytes, read_byte_reader_u24_big_endian,
    read_byte_reader_u32_big_endian,
};
use crate::types::{
    TextureContainer, TextureContainerFormat, TextureContainerLevel,
    TextureContainerParseFailureReason, TextureContainerSupercompression,
};

pub fn get_atf_parse_failure_reason(
    bytes: &Uint8Array,
) -> Option<TextureContainerParseFailureReason> {
    let mut failure = None;
    let containers = parse_atf_internal(bytes, &mut failure);
    return if containers.is_none() { failure } else { None };
}

pub fn parse_atf(bytes: &Uint8Array) -> Option<Vec<TextureContainer>> {
    return parse_atf_internal(bytes, &mut None);
}

fn parse_atf_internal(
    bytes: &Uint8Array,
    failure: &mut Option<TextureContainerParseFailureReason>,
) -> Option<Vec<TextureContainer>> {
    if !bytes.starts_with(b"ATF") {
        return reject(
            failure,
            TextureContainerParseFailureReason::ContainerUnrecognized,
        );
    }

    let versioned = bytes.get(6) == Some(&ATF_NEW_VERSION_MARKER);
    let header_offset = if versioned {
        ATF_NEW_HEADER_OFFSET
    } else {
        ATF_LEGACY_HEADER_OFFSET
    };
    if bytes.len() < header_offset + 4 {
        return reject(failure, TextureContainerParseFailureReason::HeaderTruncated);
    }
    let version = if versioned { bytes[7] } else { 0 };

    let mut length_reader = create_byte_reader(bytes, Some(if versioned { 8 } else { 3 }));
    let payload_length = if versioned {
        read_byte_reader_u32_big_endian(&mut length_reader) as usize
    } else {
        read_byte_reader_u24_big_endian(&mut length_reader) as usize
    };
    if header_offset
        .checked_add(payload_length)
        .is_none_or(|end| end > bytes.len())
    {
        return reject(
            failure,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
        );
    }

    let type_format_byte = bytes[header_offset];
    let log2_width = bytes[header_offset + 1];
    let log2_height = bytes[header_offset + 2];
    let mip_count = bytes[header_offset + 3] as usize;
    let format_code = type_format_byte & ATF_FORMAT_CODE_MASK;
    let alpha = matches!(format_code, 4 | 5 | 13);
    if !alpha && !matches!(format_code, 2 | 3 | 12) {
        return reject(
            failure,
            TextureContainerParseFailureReason::FormatUnsupported,
        );
    }
    if log2_width > ATF_MAX_LOG2_DIMENSION || log2_height > ATF_MAX_LOG2_DIMENSION {
        return reject(
            failure,
            TextureContainerParseFailureReason::StructureInvalid,
        );
    }
    if mip_count < 1 {
        return reject(
            failure,
            TextureContainerParseFailureReason::StructureInvalid,
        );
    }

    let faces = if type_format_byte & ATF_CUBE_FLAG != 0 {
        6
    } else {
        1
    };
    let width = 1usize << log2_width;
    let height = 1usize << log2_height;
    let slot_formats = if alpha {
        &ATF_ALPHA_SLOT_FORMATS
    } else {
        &ATF_OPAQUE_SLOT_FORMATS
    };
    let slot_count = if version < ATF_ETC2_VERSION { 3 } else { 4 };
    let mut per_slot_levels = vec![Vec::new(); slot_count];

    let mut reader = create_byte_reader(bytes, Some(header_offset + 4));
    let length_width = if version == 0 { 3 } else { 4 };
    for _side in 0..faces {
        for level in 0..mip_count {
            for slot_levels in per_slot_levels.iter_mut().take(slot_count) {
                if !has_byte_reader_bytes(&reader, length_width) {
                    return reject(
                        failure,
                        TextureContainerParseFailureReason::LevelRangeOutOfBounds,
                    );
                }
                let block_length = if version == 0 {
                    read_byte_reader_u24_big_endian(&mut reader) as usize
                } else {
                    read_byte_reader_u32_big_endian(&mut reader) as usize
                };
                if !has_byte_reader_bytes(&reader, block_length) {
                    return reject(
                        failure,
                        TextureContainerParseFailureReason::LevelRangeOutOfBounds,
                    );
                }
                if block_length == 0 {
                    continue;
                }
                let byte_offset = reader.offset;
                reader.offset += block_length;
                slot_levels.push(TextureContainerLevel {
                    byte_length: block_length,
                    byte_offset,
                    height: shifted_dimension(height, level),
                    width: shifted_dimension(width, level),
                });
            }
        }
    }

    let mut containers = Vec::new();
    for slot in 0..slot_count {
        let levels = std::mem::take(&mut per_slot_levels[slot]);
        if levels.is_empty() {
            continue;
        }
        containers.push(TextureContainer {
            depth: 1,
            faces,
            format: slot_formats[slot],
            height,
            layers: 1,
            mip_levels: levels.len() / faces,
            levels,
            supercompression: TextureContainerSupercompression::None,
            width,
        });
    }
    if containers.is_empty() {
        return reject(
            failure,
            TextureContainerParseFailureReason::StructureInvalid,
        );
    }
    return Some(containers);
}

fn reject(
    failure: &mut Option<TextureContainerParseFailureReason>,
    reason: TextureContainerParseFailureReason,
) -> Option<Vec<TextureContainer>> {
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

const ATF_CUBE_FLAG: u8 = 0x80;
const ATF_FORMAT_CODE_MASK: u8 = 0x7f;
const ATF_LEGACY_HEADER_OFFSET: usize = 6;
const ATF_NEW_HEADER_OFFSET: usize = 12;
const ATF_NEW_VERSION_MARKER: u8 = 0xff;
const ATF_MAX_LOG2_DIMENSION: u8 = 13;
const ATF_ETC2_VERSION: u8 = 3;
const ATF_OPAQUE_SLOT_FORMATS: [TextureContainerFormat; 4] = [
    TextureContainerFormat::Bc1,
    TextureContainerFormat::Etc1,
    TextureContainerFormat::Pvrtc4bppRgb,
    TextureContainerFormat::Etc2Rgb,
];
const ATF_ALPHA_SLOT_FORMATS: [TextureContainerFormat; 4] = [
    TextureContainerFormat::Bc3,
    TextureContainerFormat::Etc1,
    TextureContainerFormat::Pvrtc4bppRgba,
    TextureContainerFormat::Etc2Rgba,
];
