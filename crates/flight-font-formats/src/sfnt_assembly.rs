use flight_entity::Uint8Array;

use crate::binary::{to_uint32, write16, write32};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SfntFontTable {
    pub data: Box<Uint8Array>,
    pub tag: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SfntGlyphBounds {
    pub x_max: f32,
    pub x_min: f32,
    pub y_max: f32,
    pub y_min: f32,
}

pub fn assemble_sfnt_font(flavor: u32, tables: &[SfntFontTable]) -> Box<Uint8Array> {
    let ordered_tables: &[SfntFontTable] = tables;
    let mut sorted: Vec<&SfntFontTable> = ordered_tables.iter().collect();
    sorted.sort_by_key(|table| table.tag);
    let header_bytes = 12 + sorted.len() * 16;
    let mut total = header_bytes;
    for table in &sorted {
        total += (table.data.len() + 3) & !3;
    }
    let mut out = vec![0; total];
    write32(&mut out, 0, flavor);
    write16(&mut out, 4, sorted.len() as u16);
    let mut data_at = header_bytes;
    for (index, table) in sorted.iter().enumerate() {
        let record = 12 + index * 16;
        write32(&mut out, record, table.tag);
        write32(
            &mut out,
            record + 4,
            compute_sfnt_table_checksum(&table.data, Some(table.tag == 0x68656164)),
        );
        write32(&mut out, record + 8, data_at as u32);
        write32(&mut out, record + 12, table.data.len() as u32);
        out[data_at..data_at + table.data.len()].copy_from_slice(&table.data);
        data_at += (table.data.len() + 3) & !3;
    }
    return out.into_boxed_slice();
}

pub fn compute_sfnt_table_checksum(data: &Uint8Array, is_head_table: Option<bool>) -> u32 {
    let mut sum = 0u32;
    for at in (0..data.len()).step_by(4) {
        let word = if is_head_table.unwrap_or(false) && at == 8 {
            0
        } else {
            u32::from_be_bytes([
                *data.get(at).unwrap_or(&0),
                *data.get(at + 1).unwrap_or(&0),
                *data.get(at + 2).unwrap_or(&0),
                *data.get(at + 3).unwrap_or(&0),
            ])
        };
        sum = sum.wrapping_add(word);
    }
    return sum;
}

pub fn encode_sfnt_composite_glyph(
    components: &Uint8Array,
    instructions: &Uint8Array,
    bounds: &SfntGlyphBounds,
    has_instructions: bool,
) -> Box<Uint8Array> {
    let tail = if has_instructions {
        2 + instructions.len()
    } else {
        0
    };
    let mut out = vec![0; 10 + components.len() + tail];
    write16(&mut out, 0, 0xffff);
    write16(&mut out, 2, to_uint32(bounds.x_min) as u16);
    write16(&mut out, 4, to_uint32(bounds.y_min) as u16);
    write16(&mut out, 6, to_uint32(bounds.x_max) as u16);
    write16(&mut out, 8, to_uint32(bounds.y_max) as u16);
    out[10..10 + components.len()].copy_from_slice(components);
    if has_instructions {
        write16(&mut out, 10 + components.len(), instructions.len() as u16);
        out[12 + components.len()..].copy_from_slice(instructions);
    }
    return out.into_boxed_slice();
}

pub fn encode_sfnt_loca(glyph_lengths: &Vec<f32>, index_format: i32) -> Option<Box<Uint8Array>> {
    let entries = glyph_lengths.len() + 1;
    let mut out = vec![0; entries * if index_format == 0 { 2 } else { 4 }];
    let mut offset = 0.0;
    for index in 0..entries {
        if index_format == 0 {
            if offset % 2.0 != 0.0 || offset / 2.0 > 65535.0 {
                return None;
            }
            write16(&mut out, index * 2, to_uint32(offset / 2.0) as u16);
        } else {
            write32(&mut out, index * 4, to_uint32(offset));
        }
        offset += glyph_lengths.get(index).copied().unwrap_or(0.0);
    }
    return Some(out.into_boxed_slice());
}

pub fn encode_sfnt_simple_glyph(
    end_pts_of_contours: &Vec<f32>,
    xs: &Vec<f32>,
    ys: &Vec<f32>,
    on_curve: &[bool],
    instructions: &Uint8Array,
    bounds: &SfntGlyphBounds,
) -> Box<Uint8Array> {
    if end_pts_of_contours.is_empty() {
        return Vec::new().into_boxed_slice();
    }
    let mut flags = Vec::new();
    let mut x_bytes = Vec::new();
    let mut y_bytes = Vec::new();
    let mut previous_x = 0.0;
    let mut previous_y = 0.0;
    for point in 0..xs.len() {
        let x = xs[point];
        let y = ys.get(point).copied().unwrap_or(f32::NAN);
        let dx = x - previous_x;
        let dy = y - previous_y;
        previous_x = x;
        previous_y = y;
        let mut flag = if on_curve.get(point).copied().unwrap_or(false) {
            1u8
        } else {
            0
        };
        if dx == 0.0 {
            flag |= 0x10;
        } else if dx >= -255.0 && dx <= 255.0 {
            flag |= 2;
            if dx > 0.0 {
                flag |= 0x10;
            }
            x_bytes.push(to_uint32(dx.abs()) as u8);
        } else {
            let value = to_uint32(dx);
            x_bytes.extend_from_slice(&[(value >> 8) as u8, value as u8]);
        }
        if dy == 0.0 {
            flag |= 0x20;
        } else if dy >= -255.0 && dy <= 255.0 {
            flag |= 4;
            if dy > 0.0 {
                flag |= 0x20;
            }
            y_bytes.push(to_uint32(dy.abs()) as u8);
        } else {
            let value = to_uint32(dy);
            y_bytes.extend_from_slice(&[(value >> 8) as u8, value as u8]);
        }
        flags.push(flag);
    }
    let mut packed_flags = Vec::new();
    let mut index = 0;
    while index < flags.len() {
        let flag = flags[index];
        let mut run = 1;
        while index + run < flags.len() && flags[index + run] == flag && run < 256 {
            run += 1;
        }
        if run > 1 {
            packed_flags.extend_from_slice(&[flag | 8, (run - 1) as u8]);
        } else {
            packed_flags.push(flag);
        }
        index += run;
    }
    let size = 10
        + end_pts_of_contours.len() * 2
        + 2
        + instructions.len()
        + packed_flags.len()
        + x_bytes.len()
        + y_bytes.len();
    let mut out = vec![0; size];
    write16(&mut out, 0, end_pts_of_contours.len() as u16);
    write16(&mut out, 2, to_uint32(bounds.x_min) as u16);
    write16(&mut out, 4, to_uint32(bounds.y_min) as u16);
    write16(&mut out, 6, to_uint32(bounds.x_max) as u16);
    write16(&mut out, 8, to_uint32(bounds.y_max) as u16);
    let mut at = 10;
    for end in end_pts_of_contours {
        write16(&mut out, at, to_uint32(*end) as u16);
        at += 2;
    }
    write16(&mut out, at, instructions.len() as u16);
    at += 2;
    for part in [instructions, &packed_flags, &x_bytes, &y_bytes] {
        out[at..at + part.len()].copy_from_slice(part);
        at += part.len();
    }
    return out.into_boxed_slice();
}

pub fn pack_sfnt_tag(tag: &str) -> u32 {
    let mut characters = tag.encode_utf16();
    let mut out = 0;
    for _ in 0..4 {
        out = (out << 8) | u32::from(characters.next().unwrap_or(32));
    }
    return out;
}
