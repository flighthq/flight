use flight_entity::Uint8Array;

use crate::{SwfReader, SwfTagMatrix, SwfTagRectangle};

pub const FIXED_8_8_ONE: f32 = 0x100 as f32;
pub const IDENTITY_MATRIX: SwfTagMatrix = SwfTagMatrix {
    a: 1.0,
    b: 0.0,
    c: 0.0,
    d: 1.0,
    tx: 0.0,
    ty: 0.0,
};

pub fn merge_swf_rectangles(a: &SwfTagRectangle, b: &SwfTagRectangle) -> SwfTagRectangle {
    let x = a.x.min(b.x);
    let y = a.y.min(b.y);
    let max_x = (a.x + a.width).max(b.x + b.width);
    let max_y = (a.y + a.height).max(b.y + b.height);
    return SwfTagRectangle {
        height: max_y - y,
        width: max_x - x,
        x,
        y,
    };
}

pub fn read_big_endian_uint16(source: &Uint8Array, offset: usize) -> u16 {
    return u16::from(source[offset]) * 0x100 + u16::from(source[offset + 1]);
}

pub fn read_big_endian_uint32(source: &Uint8Array, offset: usize) -> u32 {
    return u32::from(source[offset]) * 0x1000000
        + u32::from(source[offset + 1]) * 0x10000
        + u32::from(source[offset + 2]) * 0x100
        + u32::from(source[offset + 3]);
}

pub fn read_swf_matrix(reader: &mut SwfReader) -> SwfTagMatrix {
    let mut a = 1.0;
    let mut d = 1.0;
    if reader.read_unsigned_bits(1) != 0.0 {
        let scale_bits = reader.read_unsigned_bits(5) as u8;
        a = reader.read_signed_bits(scale_bits) as f32 / FIXED_16_ONE;
        d = reader.read_signed_bits(scale_bits) as f32 / FIXED_16_ONE;
    }

    let mut b = 0.0;
    let mut c = 0.0;
    if reader.read_unsigned_bits(1) != 0.0 {
        let rotate_bits = reader.read_unsigned_bits(5) as u8;
        b = reader.read_signed_bits(rotate_bits) as f32 / FIXED_16_ONE;
        c = reader.read_signed_bits(rotate_bits) as f32 / FIXED_16_ONE;
    }

    let translate_bits = reader.read_unsigned_bits(5) as u8;
    let tx = reader.read_signed_bits(translate_bits) as f32 / TWIPS_PER_PIXEL;
    let ty = reader.read_signed_bits(translate_bits) as f32 / TWIPS_PER_PIXEL;
    reader.align_to_byte();
    return SwfTagMatrix { a, b, c, d, tx, ty };
}

pub fn read_swf_rectangle(reader: &mut SwfReader) -> Option<SwfTagRectangle> {
    let bits = reader.read_unsigned_bits(5) as u8;
    let x_min = reader.read_signed_bits(bits) as i32;
    let x_max = reader.read_signed_bits(bits) as i32;
    let y_min = reader.read_signed_bits(bits) as i32;
    let y_max = reader.read_signed_bits(bits) as i32;
    reader.align_to_byte();
    if !reader.valid {
        return None;
    }
    return Some(SwfTagRectangle {
        height: (y_max - y_min).max(0) as f32 / TWIPS_PER_PIXEL,
        width: (x_max - x_min).max(0) as f32 / TWIPS_PER_PIXEL,
        x: x_min as f32 / TWIPS_PER_PIXEL,
        y: y_min as f32 / TWIPS_PER_PIXEL,
    });
}

pub fn resolve_swf_dimension_bounds(width: f32, height: f32) -> Option<SwfTagRectangle> {
    if width == 0.0 || height == 0.0 {
        return None;
    }
    return Some(SwfTagRectangle {
        height,
        width,
        x: 0.0,
        y: 0.0,
    });
}

pub fn transform_swf_rectangle(bounds: &SwfTagRectangle, matrix: &SwfTagMatrix) -> SwfTagRectangle {
    let x0 = matrix.a * bounds.x + matrix.c * bounds.y + matrix.tx;
    let y0 = matrix.b * bounds.x + matrix.d * bounds.y + matrix.ty;
    let x1 = matrix.a * (bounds.x + bounds.width) + matrix.c * bounds.y + matrix.tx;
    let y1 = matrix.b * (bounds.x + bounds.width) + matrix.d * bounds.y + matrix.ty;
    let x2 = matrix.a * bounds.x + matrix.c * (bounds.y + bounds.height) + matrix.tx;
    let y2 = matrix.b * bounds.x + matrix.d * (bounds.y + bounds.height) + matrix.ty;
    let x3 =
        matrix.a * (bounds.x + bounds.width) + matrix.c * (bounds.y + bounds.height) + matrix.tx;
    let y3 =
        matrix.b * (bounds.x + bounds.width) + matrix.d * (bounds.y + bounds.height) + matrix.ty;
    let x = x0.min(x1).min(x2).min(x3);
    let y = y0.min(y1).min(y2).min(y3);
    let max_x = x0.max(x1).max(x2).max(x3);
    let max_y = y0.max(y1).max(y2).max(y3);
    return SwfTagRectangle {
        height: max_y - y,
        width: max_x - x,
        x,
        y,
    };
}

const FIXED_16_ONE: f32 = 0x10000 as f32;
const TWIPS_PER_PIXEL: f32 = 20.0;
