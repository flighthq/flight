use flight_entity::Uint8Array;

use crate::binary::{byte, unsigned16};
use crate::types::{CffIndex, CffIndexEntry};

pub fn read_cff_index(bytes: &Uint8Array, offset: usize) -> Option<CffIndex> {
    if offset.checked_add(2).is_none_or(|end| end > bytes.len()) {
        return None;
    }
    let count = usize::from(unsigned16(bytes, offset));
    if count == 0 {
        return Some(CffIndex {
            end_offset: offset + 2,
            entries: Vec::new(),
        });
    }
    let off_size = usize::from(byte(bytes, offset + 2));
    if off_size < 1 || off_size > 4 {
        return None;
    }
    let offsets_at = offset + 3;
    let data_at = offsets_at + (count + 1) * off_size - 1;
    if data_at >= bytes.len() {
        return None;
    }
    let read_offset = |index: usize| {
        let mut value = 0;
        for item in 0..off_size {
            value = value * 256 + usize::from(byte(bytes, offsets_at + index * off_size + item));
        }
        return value;
    };
    let mut entries = Vec::new();
    let mut previous = read_offset(0);
    if previous != 1 {
        return None;
    }
    for index in 0..count {
        let next = read_offset(index + 1);
        if next < previous || data_at + next > bytes.len() {
            return None;
        }
        entries.push(CffIndexEntry {
            end: data_at + next,
            start: data_at + previous,
        });
        previous = next;
    }
    return Some(CffIndex {
        end_offset: data_at + previous,
        entries,
    });
}
