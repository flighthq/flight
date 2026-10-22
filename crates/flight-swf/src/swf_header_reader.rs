use flight_entity::Uint8Array;

use crate::{SwfHeaderRectangleResult, SwfTagRectangle};

pub const SWF_HEADER_PREFIX_LENGTH: usize = 8;

pub fn read_swf_header_rectangle(
    data: &Uint8Array,
    offset: usize,
) -> Option<SwfHeaderRectangleResult> {
    if offset >= data.len() {
        return None;
    }
    let bit_count = data[offset] >> 3;
    let total_bits = 5 + usize::from(bit_count) * 4;
    let total_bytes = total_bits.div_ceil(8);
    if offset + total_bytes > data.len() {
        return None;
    }
    let mut bit_pos = offset * 8 + 5;
    let mut read_bits = |count: u8| -> i32 {
        let mut value = 0_u32;
        for _ in 0..count {
            let byte_index = bit_pos >> 3;
            let bit_index = 7 - (bit_pos & 7);
            value = (value << 1) | u32::from((data[byte_index] >> bit_index) & 1);
            bit_pos += 1;
        }
        if count == 0 {
            return 0;
        }
        let sign = 1_u32 << (count - 1);
        if value & sign != 0 {
            return i64::from(value).wrapping_sub(1_i64 << count) as i32;
        }
        return value as i32;
    };
    let x_min = read_bits(bit_count);
    let x_max = read_bits(bit_count);
    let y_min = read_bits(bit_count);
    let y_max = read_bits(bit_count);
    return Some(SwfHeaderRectangleResult {
        next_pos: offset + total_bytes,
        rect: SwfTagRectangle {
            height: (y_max - y_min).max(0) as f32 / SWF_TWIPS_PER_PIXEL,
            width: (x_max - x_min).max(0) as f32 / SWF_TWIPS_PER_PIXEL,
            x: x_min as f32 / SWF_TWIPS_PER_PIXEL,
            y: y_min as f32 / SWF_TWIPS_PER_PIXEL,
        },
    });
}

pub fn read_swf_header_uint32(data: &Uint8Array, offset: usize) -> u32 {
    return u32::from(data[offset])
        + u32::from(data[offset + 1]) * 0x100
        + u32::from(data[offset + 2]) * 0x10000
        + u32::from(data[offset + 3]) * 0x1000000;
}

const SWF_TWIPS_PER_PIXEL: f32 = 20.0;
