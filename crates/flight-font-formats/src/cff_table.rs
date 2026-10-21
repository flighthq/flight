use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Uint8Array;

use crate::binary::byte;
use crate::cff_dict::{
    CFF_OPERATOR_CHARSTRINGS, CFF_OPERATOR_FD_ARRAY, CFF_OPERATOR_FD_SELECT, CFF_OPERATOR_PRIVATE,
    CFF_OPERATOR_SUBRS, read_cff_dict,
};
use crate::cff_fd_select::read_cff_fd_select;
use crate::cff_index::read_cff_index;
use crate::types::{CffIndexEntry, CffTable, SfntTableDirectory};

fn read_cff_cid_subrs(
    bytes: &Uint8Array,
    top: &HashMap<usize, Vec<f32>>,
    table_offset: usize,
    table_end: usize,
    glyph_count: usize,
) -> Option<Vec<Arc<Vec<CffIndexEntry>>>> {
    let fd_array_offset = *top.get(&CFF_OPERATOR_FD_ARRAY)?.first()?;
    let fd_select_offset = *top.get(&CFF_OPERATOR_FD_SELECT)?.first()?;
    let fd_array = read_cff_index(bytes, (table_offset as f32 + fd_array_offset) as usize)?;
    if fd_array.entries.is_empty() {
        return None;
    }
    let mut pools = Vec::new();
    for entry in fd_array.entries {
        let font_dict = read_cff_dict(bytes, entry.start, entry.end)?;
        pools.push(read_cff_local_subrs(
            bytes,
            &font_dict,
            table_offset,
            table_end,
        ));
    }
    let select = read_cff_fd_select(
        bytes,
        (table_offset as f32 + fd_select_offset) as usize,
        glyph_count,
    )?;
    let mut by_glyph = Vec::new();
    for glyph in 0..glyph_count {
        by_glyph.push(Arc::clone(pools.get(usize::from(select[glyph]))?));
    }
    return Some(by_glyph);
}

fn read_cff_local_subrs(
    bytes: &Uint8Array,
    top: &HashMap<usize, Vec<f32>>,
    table_offset: usize,
    table_end: usize,
) -> Arc<Vec<CffIndexEntry>> {
    let Some(private_entry) = top.get(&CFF_OPERATOR_PRIVATE) else {
        return Arc::new(Vec::new());
    };
    if private_entry.len() < 2 {
        return Arc::new(Vec::new());
    }
    let private_size = private_entry[0];
    let private_at = table_offset as f32 + private_entry[1];
    if private_at < table_offset as f32 || private_at + private_size > table_end as f32 {
        return Arc::new(Vec::new());
    }
    let private_dict = read_cff_dict(
        bytes,
        private_at as usize,
        (private_at + private_size) as usize,
    );
    let Some(subrs_offset) = private_dict
        .as_ref()
        .and_then(|dict| dict.get(&CFF_OPERATOR_SUBRS))
        .and_then(|values| values.first())
    else {
        return Arc::new(Vec::new());
    };
    let subrs = read_cff_index(bytes, (private_at + subrs_offset) as usize);
    return Arc::new(subrs.map_or_else(Vec::new, |index| index.entries));
}

pub fn read_cff_table(bytes: &Uint8Array, directory: &SfntTableDirectory) -> Option<CffTable> {
    let table = directory.tables.get("CFF ")?;
    if table.length < 4 {
        return None;
    }
    let header_size = usize::from(byte(bytes, table.offset + 2));
    let table_end = table.offset + table.length;
    let names = read_cff_index(bytes, table.offset + header_size)?;
    let top_dicts = read_cff_index(bytes, names.end_offset)?;
    let top_entry = top_dicts.entries.first()?;
    let strings = read_cff_index(bytes, top_dicts.end_offset)?;
    let globals = read_cff_index(bytes, strings.end_offset)?;
    let top = read_cff_dict(bytes, top_entry.start, top_entry.end)?;
    let charstrings_offset = *top.get(&CFF_OPERATOR_CHARSTRINGS)?.first()?;
    let charstrings_at = table.offset as f32 + charstrings_offset;
    if charstrings_at < table.offset as f32 || charstrings_at >= table_end as f32 {
        return None;
    }
    let charstrings = read_cff_index(bytes, charstrings_at as usize)?;
    let is_cid =
        top.contains_key(&CFF_OPERATOR_FD_ARRAY) && top.contains_key(&CFF_OPERATOR_FD_SELECT);
    if is_cid {
        let per_glyph = read_cff_cid_subrs(
            bytes,
            &top,
            table.offset,
            table_end,
            charstrings.entries.len(),
        )?;
        return Some(CffTable {
            charstrings: charstrings.entries,
            global_subrs: globals.entries,
            local_subrs: Arc::new(Vec::new()),
            local_subrs_by_glyph: Some(per_glyph),
        });
    }
    return Some(CffTable {
        charstrings: charstrings.entries,
        global_subrs: globals.entries,
        local_subrs: read_cff_local_subrs(bytes, &top, table.offset, table_end),
        local_subrs_by_glyph: None,
    });
}
