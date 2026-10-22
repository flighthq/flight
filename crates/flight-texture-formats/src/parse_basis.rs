use flight_entity::Uint8Array;

use flight_buffer::{
    create_byte_reader, has_byte_reader_bytes, read_byte_reader_u8, read_byte_reader_u16,
    read_byte_reader_u24, read_byte_reader_u32,
};
use crate::types::{
    TextureContainer, TextureContainerFormat, TextureContainerLevel,
    TextureContainerParseFailureReason, TextureContainerSupercompression,
};

#[derive(Clone, Copy)]
struct BasisTextureShape {
    depth: usize,
    faces: usize,
    layers: usize,
}

pub fn get_basis_parse_failure_reason(
    bytes: &Uint8Array,
) -> Option<TextureContainerParseFailureReason> {
    let mut failure = None;
    let container = parse_basis_internal(bytes, &mut failure);
    return if container.is_none() { failure } else { None };
}

fn get_basis_texture_shape(texture_type: u8, total_images: usize) -> Option<BasisTextureShape> {
    let images = total_images.max(1);
    return match texture_type {
        BASIS_TEXTURE_TYPE_2D | BASIS_TEXTURE_TYPE_2D_ARRAY => Some(BasisTextureShape {
            depth: 1,
            faces: 1,
            layers: images,
        }),
        BASIS_TEXTURE_TYPE_CUBEMAP_ARRAY => {
            if total_images == 0 || !total_images.is_multiple_of(6) {
                None
            } else {
                Some(BasisTextureShape {
                    depth: 1,
                    faces: 6,
                    layers: total_images / 6,
                })
            }
        }
        BASIS_TEXTURE_TYPE_VIDEO_FRAMES => None,
        BASIS_TEXTURE_TYPE_VOLUME => Some(BasisTextureShape {
            depth: images,
            faces: 1,
            layers: 1,
        }),
        _ => None,
    };
}

pub fn parse_basis(bytes: &Uint8Array) -> Option<TextureContainer> {
    return parse_basis_internal(bytes, &mut None);
}

fn parse_basis_internal(
    bytes: &Uint8Array,
    failure: &mut Option<TextureContainerParseFailureReason>,
) -> Option<TextureContainer> {
    if !bytes.starts_with(&[0x73, 0x42]) {
        return reject(
            failure,
            TextureContainerParseFailureReason::ContainerUnrecognized,
        );
    }
    if bytes.len() < BASIS_HEADER_MIN_SIZE {
        return reject(failure, TextureContainerParseFailureReason::HeaderTruncated);
    }

    let mut header = create_byte_reader(bytes, Some(BASIS_TOTAL_SLICES_OFFSET));
    let total_slices = read_byte_reader_u24(&mut header) as usize;
    let total_images = read_byte_reader_u24(&mut header) as usize;
    let format = match bytes[BASIS_TEX_FORMAT_OFFSET] {
        0 => TextureContainerFormat::Etc1s,
        1 => TextureContainerFormat::Uastc,
        _ => {
            return reject(
                failure,
                TextureContainerParseFailureReason::FormatUnsupported,
            );
        }
    };
    if total_slices == 0 {
        return reject(
            failure,
            TextureContainerParseFailureReason::StructureInvalid,
        );
    }
    let Some(shape) = get_basis_texture_shape(bytes[BASIS_TEX_TYPE_OFFSET], total_images) else {
        return reject(
            failure,
            TextureContainerParseFailureReason::FormatUnsupported,
        );
    };

    let mut slice_offset_reader = create_byte_reader(bytes, Some(BASIS_SLICE_DESC_OFFSET_FIELD));
    let slice_desc_offset = read_byte_reader_u32(&mut slice_offset_reader) as usize;
    let table = create_byte_reader(bytes, Some(slice_desc_offset));
    let Some(table_length) = total_slices.checked_mul(BASIS_SLICE_DESC_SIZE) else {
        return reject(
            failure,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
        );
    };
    if !has_byte_reader_bytes(&table, table_length) {
        return reject(
            failure,
            TextureContainerParseFailureReason::LevelRangeOutOfBounds,
        );
    }

    let mut table = table;
    let mut levels = Vec::with_capacity(total_slices);
    let mut base_width = 0usize;
    let mut base_height = 0usize;
    let mut max_level = 0usize;
    for _slice in 0..total_slices {
        let image_index = read_byte_reader_u24(&mut table);
        let level_index = read_byte_reader_u8(&mut table) as usize;
        read_byte_reader_u8(&mut table);
        let width = read_byte_reader_u16(&mut table) as usize;
        let height = read_byte_reader_u16(&mut table) as usize;
        read_byte_reader_u16(&mut table);
        read_byte_reader_u16(&mut table);
        let byte_offset = read_byte_reader_u32(&mut table) as usize;
        let byte_length = read_byte_reader_u32(&mut table) as usize;
        read_byte_reader_u16(&mut table);
        if byte_offset
            .checked_add(byte_length)
            .is_none_or(|end| end > bytes.len())
        {
            return reject(
                failure,
                TextureContainerParseFailureReason::LevelRangeOutOfBounds,
            );
        }
        if image_index == 0 && level_index == 0 {
            base_width = width;
            base_height = height;
        }
        max_level = max_level.max(level_index + 1);
        levels.push(TextureContainerLevel {
            byte_length,
            byte_offset,
            height,
            width,
        });
    }
    if base_width == 0 {
        base_width = levels[0].width;
    }
    if base_height == 0 {
        base_height = levels[0].height;
    }

    return Some(TextureContainer {
        depth: shape.depth,
        faces: shape.faces,
        format,
        height: base_height,
        layers: shape.layers,
        levels,
        mip_levels: max_level.max(1),
        supercompression: TextureContainerSupercompression::None,
        width: base_width,
    });
}

fn reject(
    failure: &mut Option<TextureContainerParseFailureReason>,
    reason: TextureContainerParseFailureReason,
) -> Option<TextureContainer> {
    *failure = Some(reason);
    return None;
}

const BASIS_TOTAL_SLICES_OFFSET: usize = 14;
const BASIS_TEX_FORMAT_OFFSET: usize = 20;
const BASIS_TEX_TYPE_OFFSET: usize = 23;
const BASIS_SLICE_DESC_OFFSET_FIELD: usize = 65;
const BASIS_HEADER_MIN_SIZE: usize = 69;
const BASIS_SLICE_DESC_SIZE: usize = 23;
const BASIS_TEXTURE_TYPE_2D: u8 = 0;
const BASIS_TEXTURE_TYPE_2D_ARRAY: u8 = 1;
const BASIS_TEXTURE_TYPE_CUBEMAP_ARRAY: u8 = 2;
const BASIS_TEXTURE_TYPE_VIDEO_FRAMES: u8 = 3;
const BASIS_TEXTURE_TYPE_VOLUME: u8 = 4;
