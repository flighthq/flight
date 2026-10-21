use std::collections::HashMap;

use flight_buffer::{ArrayBufferView, get_array_buffer_storage};
use flight_entity::Uint8Array;

use crate::binary::{signed16, unsigned16, unsigned32};
use crate::types::SfntTableDirectory;

pub fn find_open_type_unicode_subtable(
    view: &ArrayBufferView,
    cmap_offset: usize,
    cmap_length: usize,
    byte_length: usize,
) -> i32 {
    let storage = get_array_buffer_storage(&view.buffer);
    let bytes = storage.read().unwrap();
    return find_unicode_subtable(
        &bytes[view.byte_offset..view.byte_offset + view.byte_length],
        cmap_offset,
        cmap_length,
        byte_length,
    );
}

fn find_unicode_subtable(
    bytes: &Uint8Array,
    cmap_offset: usize,
    cmap_length: usize,
    byte_length: usize,
) -> i32 {
    let record_count = usize::from(unsigned16(bytes, cmap_offset + 2));
    let mut best = -1;
    let mut best_rank = -1;
    for index in 0..record_count {
        let record = cmap_offset + 4 + index * 8;
        if record + 8 > cmap_offset + cmap_length || record + 8 > byte_length {
            break;
        }
        let platform = unsigned16(bytes, record);
        let encoding = unsigned16(bytes, record + 2);
        let offset = cmap_offset + unsigned32(bytes, record + 4) as usize;
        if offset + 4 > byte_length {
            continue;
        }
        let rank = rank_open_type_unicode_encoding(i32::from(platform), i32::from(encoding));
        if rank <= best_rank {
            continue;
        }
        let format = unsigned16(bytes, offset);
        if format != 4 && format != 12 {
            continue;
        }
        best = offset as i32;
        best_rank = rank;
    }
    return best;
}

pub fn rank_open_type_unicode_encoding(platform: i32, encoding: i32) -> i32 {
    if platform == 3 && encoding == 10 {
        return 2;
    }
    if platform == 0 && (encoding == 4 || encoding == 6) {
        return 2;
    }
    if platform == 3 && encoding == 1 {
        return 1;
    }
    if platform == 0 && encoding <= 3 {
        return 1;
    }
    return -1;
}

fn read_open_type_cmap_format12(
    bytes: &Uint8Array,
    offset: usize,
    byte_length: usize,
) -> HashMap<u32, u32> {
    let mut map = HashMap::new();
    if offset + 16 > byte_length {
        return map;
    }
    let group_count = unsigned32(bytes, offset + 12) as usize;
    for group in 0..group_count {
        let record = offset + 16 + group * 12;
        if record + 12 > byte_length {
            break;
        }
        let start = unsigned32(bytes, record);
        let end = unsigned32(bytes, record + 4);
        let start_glyph = unsigned32(bytes, record + 8);
        if start > end {
            continue;
        }
        for code_point in start..=end {
            let glyph = start_glyph.wrapping_add(code_point - start);
            if glyph != 0 {
                map.insert(code_point, glyph);
            }
        }
    }
    return map;
}

fn read_open_type_cmap_format4(
    bytes: &Uint8Array,
    offset: usize,
    byte_length: usize,
) -> HashMap<u32, u32> {
    let mut map = HashMap::new();
    let segment_bytes = usize::from(unsigned16(bytes, offset + 6));
    let ends_at = offset + 14;
    let starts_at = ends_at + segment_bytes + 2;
    let deltas_at = starts_at + segment_bytes;
    let ranges_at = deltas_at + segment_bytes;
    if ranges_at + segment_bytes > byte_length {
        return map;
    }
    for segment in 0..(segment_bytes + 1) / 2 {
        let end = unsigned16(bytes, ends_at + segment * 2);
        let start = unsigned16(bytes, starts_at + segment * 2);
        if start > end || start == 0xffff {
            continue;
        }
        let delta = i32::from(signed16(bytes, deltas_at + segment * 2));
        let range_offset_at = ranges_at + segment * 2;
        let range_offset = usize::from(unsigned16(bytes, range_offset_at));
        for code_point in start..=end {
            let glyph;
            if range_offset == 0 {
                glyph = (i32::from(code_point) + delta) as u16;
            } else {
                let glyph_at = range_offset_at + range_offset + usize::from(code_point - start) * 2;
                if glyph_at + 2 > byte_length {
                    continue;
                }
                let raw = unsigned16(bytes, glyph_at);
                if raw == 0 {
                    continue;
                }
                glyph = (i32::from(raw) + delta) as u16;
            }
            if glyph != 0 {
                map.insert(u32::from(code_point), u32::from(glyph));
            }
        }
    }
    return map;
}

pub fn read_open_type_codepoint_map(
    bytes: &Uint8Array,
    directory: &SfntTableDirectory,
) -> Option<HashMap<u32, u32>> {
    let cmap = directory.tables.get("cmap")?;
    if cmap.length < 4 {
        return None;
    }
    let subtable_offset = find_unicode_subtable(bytes, cmap.offset, cmap.length, bytes.len());
    if subtable_offset == -1 {
        return None;
    }
    let offset = subtable_offset as usize;
    let format = unsigned16(bytes, offset);
    if format == 4 {
        return Some(read_open_type_cmap_format4(bytes, offset, bytes.len()));
    }
    if format == 12 {
        return Some(read_open_type_cmap_format12(bytes, offset, bytes.len()));
    }
    return None;
}
