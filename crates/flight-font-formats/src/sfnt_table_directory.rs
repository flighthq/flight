use std::collections::HashMap;

use flight_entity::Uint8Array;

use crate::binary::{unsigned16, unsigned32};
use crate::types::{SfntTableDirectory, SfntTableRange};

pub fn read_sfnt_table_directory(bytes: &Uint8Array) -> Option<SfntTableDirectory> {
    if bytes.len() < 12 {
        return None;
    }
    let declared_table_count = usize::from(unsigned16(bytes, 4));
    let mut tables = HashMap::new();
    let mut table_order = Vec::new();
    for index in 0..declared_table_count {
        let record = 12 + index * 16;
        if record + 16 > bytes.len() {
            break;
        }
        let offset = unsigned32(bytes, record + 8) as usize;
        let length = unsigned32(bytes, record + 12) as usize;
        if offset + length > bytes.len() {
            continue;
        }
        let tag = read_sfnt_tag(bytes, record);
        if !tables.contains_key(&tag) {
            table_order.push(tag.clone());
        }
        tables.insert(tag, SfntTableRange { length, offset });
    }
    return Some(SfntTableDirectory {
        declared_table_count,
        sfnt_version: unsigned32(bytes, 0),
        tables,
        table_order,
    });
}

pub fn read_sfnt_tag(bytes: &Uint8Array, offset: usize) -> String {
    let mut tag = String::new();
    for index in 0..4 {
        tag.push(char::from(*bytes.get(offset + index).unwrap_or(&0)));
    }
    return tag;
}
