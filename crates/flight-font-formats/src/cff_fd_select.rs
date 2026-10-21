use flight_entity::Uint8Array;

use crate::binary::{byte, unsigned16};

pub fn read_cff_fd_select(
    bytes: &Uint8Array,
    offset: usize,
    glyph_count: usize,
) -> Option<Box<Uint8Array>> {
    if offset.checked_add(1).is_none_or(|end| end > bytes.len()) {
        return None;
    }
    let format = byte(bytes, offset);
    if format == 0 {
        if offset + 1 + glyph_count > bytes.len() {
            return None;
        }
        let mut select = vec![0; glyph_count];
        for glyph in 0..glyph_count {
            select[glyph] = byte(bytes, offset + 1 + glyph);
        }
        return Some(select.into_boxed_slice());
    }
    if format != 3 {
        return None;
    }
    if offset + 5 > bytes.len() {
        return None;
    }
    let range_count = usize::from(unsigned16(bytes, offset + 1));
    let sentinel_at = offset + 3 + range_count * 3;
    if sentinel_at + 2 > bytes.len() {
        return None;
    }
    let mut select = vec![0; glyph_count];
    let mut covered = 0;
    for range in 0..range_count {
        let first = usize::from(unsigned16(bytes, offset + 3 + range * 3));
        let fd = byte(bytes, offset + 5 + range * 3);
        let next = if range + 1 < range_count {
            usize::from(unsigned16(bytes, offset + 3 + (range + 1) * 3))
        } else {
            usize::from(unsigned16(bytes, sentinel_at))
        };
        if next < first || next > glyph_count {
            return None;
        }
        for glyph in first..next {
            select[glyph] = fd;
        }
        covered = covered.max(next);
    }
    return if covered == glyph_count {
        Some(select.into_boxed_slice())
    } else {
        None
    };
}
