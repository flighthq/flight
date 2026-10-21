use flight_bitmapfont::{BitmapFont, BitmapFontEncoding, BitmapFontGuardStateRef};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;

use crate::bitmap_font_record::{
    build_bitmap_font_from_record, report_dropped_bitmap_font_records,
};
use crate::types::*;

const BLOCK_COMMON: u8 = 2;
const BLOCK_PAGES: u8 = 3;
const BLOCK_CHARS: u8 = 4;
const BLOCK_KERNING: u8 = 5;
const CHAR_STRIDE: usize = 20;
const KERNING_STRIDE: usize = 10;

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the bitmap-font module guard slot
pub fn parse_bitmap_font_binary(
    guard_state: &BitmapFontGuardStateRef,
    bytes: &Uint8Array,
    options: Option<&BitmapFontParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<BitmapFont>> {
    let record = parse_bitmap_font_binary_record(bytes, diagnostics)?;
    return build_bitmap_font_from_record(guard_state, &record, options);
}

fn parse_bitmap_font_binary_record(
    bytes: &Uint8Array,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<BitmapFontRecord> {
    if bytes.len() < 4 || bytes[0..4] != [66, 77, 70, 3] {
        return None;
    }
    let mut offset = 4;
    let mut line_height = None;
    let mut base = None;
    let pages = &mut Vec::new();
    let chars = &mut Vec::new();
    let kernings = &mut Vec::new();
    let dropped_chars = 0;
    let dropped_kernings = 0;
    while offset + 5 <= bytes.len() {
        let block_type = bytes[offset];
        let block_size = read_u32(bytes, offset + 1)? as usize;
        offset += 5;
        let Some(block_end) = offset.checked_add(block_size) else {
            break;
        };
        if block_end > bytes.len() {
            break;
        }
        match block_type {
            BLOCK_COMMON if block_size >= 4 => {
                line_height = Some(read_u16(bytes, offset)? as f32);
                base = Some(read_u16(bytes, offset + 2)? as f32);
            }
            BLOCK_PAGES => read_page_block(bytes, offset, block_size, pages),
            BLOCK_CHARS => {
                for index in 0..block_size / CHAR_STRIDE {
                    chars.push(read_binary_char(bytes, offset + index * CHAR_STRIDE)?);
                }
            }
            BLOCK_KERNING => {
                for index in 0..block_size / KERNING_STRIDE {
                    kernings.push(read_binary_kerning(bytes, offset + index * KERNING_STRIDE)?);
                }
            }
            _ => {}
        }
        offset = block_end;
    }
    report_dropped_bitmap_font_records(
        diagnostics,
        "parseBitmapFontBinaryRecord",
        0,
        dropped_chars,
        dropped_kernings,
    );
    if chars.is_empty() {
        return None;
    }
    return Some(BitmapFontRecord {
        base: base?,
        chars: std::mem::take(chars),
        encoding: BitmapFontEncoding::Raster,
        kernings: std::mem::take(kernings),
        line_height: line_height?,
        pages: std::mem::take(pages),
    });
}

fn read_binary_char(bytes: &Uint8Array, offset: usize) -> Option<BitmapFontCharRecord> {
    return Some(BitmapFontCharRecord {
        height: read_u16(bytes, offset + 10)? as u32,
        id: read_u32(bytes, offset)?,
        page: *bytes.get(offset + 18)? as i32,
        width: read_u16(bytes, offset + 8)? as u32,
        x: read_u16(bytes, offset + 4)? as u32,
        xadvance: read_i16(bytes, offset + 16)? as f32,
        xoffset: read_i16(bytes, offset + 12)? as i32,
        y: read_u16(bytes, offset + 6)? as u32,
        yoffset: read_i16(bytes, offset + 14)? as i32,
    });
}

fn read_binary_kerning(bytes: &Uint8Array, offset: usize) -> Option<BitmapFontKerningRecord> {
    return Some(BitmapFontKerningRecord {
        amount: read_i16(bytes, offset + 8)? as f32,
        first: read_u32(bytes, offset)?,
        second: read_u32(bytes, offset + 4)?,
    });
}

fn read_page_block(
    bytes: &Uint8Array,
    offset: usize,
    size: usize,
    pages: &mut Vec<BitmapFontPageRecord>,
) {
    let mut id = 0;
    let mut start = offset;
    let end = offset + size;
    for index in offset..end {
        if bytes[index] == 0 {
            let file: String = bytes[start..index]
                .iter()
                .map(|byte| char::from(*byte))
                .collect();
            pages.push(BitmapFontPageRecord { file, id });
            id += 1;
            start = index + 1;
        }
    }
}

fn read_i16(bytes: &Uint8Array, offset: usize) -> Option<i16> {
    return Some(i16::from_le_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
    ]));
}

fn read_u16(bytes: &Uint8Array, offset: usize) -> Option<u16> {
    return Some(u16::from_le_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
    ]));
}

fn read_u32(bytes: &Uint8Array, offset: usize) -> Option<u32> {
    return Some(u32::from_le_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
        *bytes.get(offset + 2)?,
        *bytes.get(offset + 3)?,
    ]));
}
