use flight_entity::Uint8Array;

use crate::byte_reader::{
    create_byte_reader, has_byte_reader_bytes, read_byte_reader_u32, skip_byte_reader,
};
use crate::texture_level_layout::compute_texture_container_levels;
use crate::types::{
    TextureContainer, TextureContainerFormat, TextureContainerParseFailureReason,
    TextureContainerSupercompression,
};

pub fn get_dds_parse_failure_reason(
    bytes: &Uint8Array,
) -> Option<TextureContainerParseFailureReason> {
    let mut failure = None;
    let container = parse_dds_internal(bytes, &mut failure);
    return if container.is_none() { failure } else { None };
}

fn map_dds_dxgi_format(value: u32) -> Option<TextureContainerFormat> {
    return match value {
        2 => Some(TextureContainerFormat::Rgba32f),
        10 => Some(TextureContainerFormat::Rgba16f),
        28 => Some(TextureContainerFormat::Rgba8Unorm),
        29 => Some(TextureContainerFormat::Rgba8Srgb),
        49 => Some(TextureContainerFormat::Rg8Unorm),
        61 => Some(TextureContainerFormat::R8Unorm),
        71 => Some(TextureContainerFormat::Bc1),
        72 => Some(TextureContainerFormat::Bc1Srgb),
        74 => Some(TextureContainerFormat::Bc2),
        75 => Some(TextureContainerFormat::Bc2Srgb),
        77 => Some(TextureContainerFormat::Bc3),
        78 => Some(TextureContainerFormat::Bc3Srgb),
        80 => Some(TextureContainerFormat::Bc4),
        81 => Some(TextureContainerFormat::Bc4Snorm),
        83 => Some(TextureContainerFormat::Bc5),
        84 => Some(TextureContainerFormat::Bc5Snorm),
        87 => Some(TextureContainerFormat::Bgra8Unorm),
        91 => Some(TextureContainerFormat::Bgra8Srgb),
        95 => Some(TextureContainerFormat::Bc6hUfloat),
        96 => Some(TextureContainerFormat::Bc6hSfloat),
        98 => Some(TextureContainerFormat::Bc7),
        99 => Some(TextureContainerFormat::Bc7Srgb),
        _ => None,
    };
}

fn map_dds_four_cc_format(value: u32) -> Option<TextureContainerFormat> {
    return match value {
        113 => Some(TextureContainerFormat::Rgba16f),
        116 => Some(TextureContainerFormat::Rgba32f),
        0x3154_5844 => Some(TextureContainerFormat::Bc1),
        0x3254_5844 | 0x3354_5844 => Some(TextureContainerFormat::Bc2),
        0x3454_5844 | 0x3554_5844 => Some(TextureContainerFormat::Bc3),
        0x3149_5441 | 0x5534_4342 => Some(TextureContainerFormat::Bc4),
        0x5334_4342 => Some(TextureContainerFormat::Bc4Snorm),
        0x3249_5441 | 0x5535_4342 => Some(TextureContainerFormat::Bc5),
        0x5335_4342 => Some(TextureContainerFormat::Bc5Snorm),
        _ => None,
    };
}

fn map_dds_uncompressed(
    rgb_bit_count: u32,
    r_mask: u32,
    g_mask: u32,
    b_mask: u32,
    a_mask: u32,
) -> Option<TextureContainerFormat> {
    if rgb_bit_count != 32 {
        return None;
    }
    if (r_mask, g_mask, b_mask, a_mask) == (0x00ff_0000, 0x0000_ff00, 0x0000_00ff, 0xff00_0000) {
        return Some(TextureContainerFormat::Bgra8Unorm);
    }
    if (r_mask, g_mask, b_mask, a_mask) == (0x0000_00ff, 0x0000_ff00, 0x00ff_0000, 0xff00_0000) {
        return Some(TextureContainerFormat::Rgba8Unorm);
    }
    return None;
}

pub fn parse_dds(bytes: &Uint8Array) -> Option<TextureContainer> {
    return parse_dds_internal(bytes, &mut None);
}

fn parse_dds_internal(
    bytes: &Uint8Array,
    failure: &mut Option<TextureContainerParseFailureReason>,
) -> Option<TextureContainer> {
    if !bytes.starts_with(b"DDS ") {
        return reject(
            failure,
            TextureContainerParseFailureReason::ContainerUnrecognized,
        );
    }
    if bytes.len() < DDS_DATA_OFFSET {
        return reject(failure, TextureContainerParseFailureReason::HeaderTruncated);
    }

    let mut reader = create_byte_reader(bytes, Some(4));
    skip_byte_reader(&mut reader, 4);
    skip_byte_reader(&mut reader, 4);
    let dw_height = read_byte_reader_u32(&mut reader) as usize;
    let dw_width = read_byte_reader_u32(&mut reader) as usize;
    skip_byte_reader(&mut reader, 4);
    let dw_depth = read_byte_reader_u32(&mut reader);
    let dw_mip_map_count = read_byte_reader_u32(&mut reader) as usize;

    reader.offset = 80;
    let pf_flags = read_byte_reader_u32(&mut reader);
    let four_cc = read_byte_reader_u32(&mut reader);
    let rgb_bit_count = read_byte_reader_u32(&mut reader);
    let r_mask = read_byte_reader_u32(&mut reader);
    let g_mask = read_byte_reader_u32(&mut reader);
    let b_mask = read_byte_reader_u32(&mut reader);
    let a_mask = read_byte_reader_u32(&mut reader);

    reader.offset = 112;
    let caps2 = read_byte_reader_u32(&mut reader);
    if caps2 & DDS_CAPS2_VOLUME != 0 || dw_depth > 1 {
        return reject(
            failure,
            TextureContainerParseFailureReason::FormatUnsupported,
        );
    }

    let mut cube = caps2 & DDS_CAPS2_CUBEMAP != 0;
    let mut layers = 1usize;
    let mut data_offset = DDS_DATA_OFFSET;
    let format = if pf_flags & DDS_PF_FOUR_CC != 0 && four_cc == DDS_FOUR_CC_DX10 {
        let extension = create_byte_reader(bytes, Some(DDS_DATA_OFFSET));
        if !has_byte_reader_bytes(&extension, 20) {
            return reject(failure, TextureContainerParseFailureReason::HeaderTruncated);
        }
        let mut dx10 = extension;
        let dxgi_format = read_byte_reader_u32(&mut dx10);
        skip_byte_reader(&mut dx10, 4);
        let misc_flag = read_byte_reader_u32(&mut dx10);
        let array_size = read_byte_reader_u32(&mut dx10) as usize;
        cube = cube || misc_flag & DDS_DX10_MISC_CUBE != 0;
        layers = array_size.max(1);
        data_offset += 20;
        map_dds_dxgi_format(dxgi_format)
    } else if pf_flags & DDS_PF_FOUR_CC != 0 {
        map_dds_four_cc_format(four_cc)
    } else if pf_flags & DDS_PF_RGB != 0 {
        map_dds_uncompressed(rgb_bit_count, r_mask, g_mask, b_mask, a_mask)
    } else {
        None
    };
    let Some(format) = format else {
        return reject(
            failure,
            TextureContainerParseFailureReason::FormatUnsupported,
        );
    };

    let width = dw_width.max(1);
    let height = dw_height.max(1);
    let faces = if cube { 6 } else { 1 };
    let mip_levels = dw_mip_map_count.max(1);
    let Some(layout) = compute_texture_container_levels(
        format,
        width,
        height,
        mip_levels,
        layers,
        faces,
        data_offset,
    ) else {
        return reject(
            failure,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
        );
    };
    if layout.end_offset > bytes.len() {
        return reject(
            failure,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
        );
    }

    return Some(TextureContainer {
        depth: 1,
        faces,
        format,
        height,
        layers,
        levels: layout.levels,
        mip_levels,
        supercompression: TextureContainerSupercompression::None,
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

const DDS_DATA_OFFSET: usize = 128;
const DDS_CAPS2_CUBEMAP: u32 = 0x200;
const DDS_CAPS2_VOLUME: u32 = 0x20_0000;
const DDS_DX10_MISC_CUBE: u32 = 0x4;
const DDS_FOUR_CC_DX10: u32 = 0x3031_5844;
const DDS_PF_FOUR_CC: u32 = 0x4;
const DDS_PF_RGB: u32 = 0x40;
