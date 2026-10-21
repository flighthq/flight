use std::collections::HashMap;
use std::sync::Arc;

use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    get_array_buffer_storage,
};
use flight_compression::{CompressionFraming, Decompressor};
use flight_entity::Uint8Array;

use crate::binary::{byte, unsigned16, unsigned32};
use crate::sfnt_assembly::{SfntFontTable, assemble_sfnt_font, pack_sfnt_tag};
use crate::sfnt_table_directory::read_sfnt_tag;
use crate::types::{Woff2TableDirectory, Woff2TableEntry};

pub type Woff2TransformReverser = Arc<
    dyn Fn(&str, &ArrayBufferView, &HashMap<String, ArrayBufferView>) -> Option<ArrayBufferView>
        + Send
        + Sync,
>;

const WOFF2_KNOWN_TAGS: [&str; 63] = [
    "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca",
    "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
    "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL",
    "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
    "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
    "Gloc", "Feat", "Sill",
];

fn read_woff2_base128(bytes: &Uint8Array, cursor: &mut usize, end: usize) -> Option<usize> {
    let mut value = 0usize;
    for index in 0..5 {
        if *cursor >= end {
            return None;
        }
        let next = byte(bytes, *cursor);
        *cursor += 1;
        if index == 0 && next == 0x80 {
            return None;
        }
        value = value * 128 + usize::from(next & 0x7f);
        if next & 0x80 == 0 {
            return if value > 0xffffffff {
                None
            } else {
                Some(value)
            };
        }
    }
    return None;
}

pub fn read_woff2_font(
    bytes: &Uint8Array,
    decompress: Option<&Decompressor>,
    reverse_transform: Option<&Woff2TransformReverser>,
) -> Option<Box<Uint8Array>> {
    let directory = read_woff2_table_directory(bytes)?;
    let decompress = decompress?;
    let flavor = unsigned32(bytes, 4);
    let total_compressed_size = unsigned32(bytes, 20) as usize;
    let stream_end = directory.stream_start + total_compressed_size;
    if stream_end > bytes.len() {
        return None;
    }
    let stream = decompress(
        &bytes[directory.stream_start..stream_end],
        directory.total_uncompressed_length,
        CompressionFraming::Raw,
    )?;
    if stream.len() < directory.total_uncompressed_length {
        return None;
    }
    let stream_buffer = create_array_buffer_from_bytes(stream);
    let mut raw = HashMap::new();
    let mut at = 0;
    let stream_length = {
        let storage = get_array_buffer_storage(&stream_buffer);
        let length = storage.read().unwrap().len();
        length
    };
    for entry in &directory.entries {
        let length = if entry.transformed {
            entry.transform_length
        } else {
            entry.original_length
        };
        if at + length > stream_length {
            return None;
        }
        raw.insert(
            entry.tag.clone(),
            create_array_buffer_view(&stream_buffer, at, length, ArrayBufferViewKind::Uint8Array)?,
        );
        at += length;
    }
    let mut retained_tables = Vec::new();
    for entry in &directory.entries {
        let stored = raw.get(&entry.tag)?;
        let data = if entry.transformed {
            (reverse_transform?)(&entry.tag, stored, &raw)?
        } else {
            stored.clone()
        };
        retained_tables.push((data, pack_sfnt_tag(&entry.tag)));
    }
    let mut tables = Vec::new();
    for (data, tag) in retained_tables {
        let storage = get_array_buffer_storage(&data.buffer);
        let bytes = storage.read().unwrap();
        tables.push(SfntFontTable {
            data: bytes[data.byte_offset..data.byte_offset + data.byte_length]
                .to_vec()
                .into_boxed_slice(),
            tag,
        });
    }

    return Some(assemble_sfnt_font(flavor, &tables));
}

pub fn read_woff2_table_directory(bytes: &Uint8Array) -> Option<Woff2TableDirectory> {
    if bytes.len() < 48 {
        return None;
    }
    let table_count = usize::from(unsigned16(bytes, 12));
    if table_count == 0 {
        return None;
    }
    let mut cursor = 48;
    let mut entries = Vec::new();
    let mut total_uncompressed_length = 0;
    for _ in 0..table_count {
        if cursor >= bytes.len() {
            return None;
        }
        let flags = byte(bytes, cursor);
        cursor += 1;
        let tag_index = usize::from(flags & 0x3f);
        let transform_version = (flags >> 6) & 3;
        let tag = if tag_index == 63 {
            if cursor + 4 > bytes.len() {
                return None;
            }
            let tag = read_sfnt_tag(bytes, cursor);
            cursor += 4;
            tag
        } else {
            WOFF2_KNOWN_TAGS[tag_index].to_string()
        };
        let original_length = read_woff2_base128(bytes, &mut cursor, bytes.len())?;
        let is_glyph_pair = tag == "glyf" || tag == "loca";
        let transformed = if is_glyph_pair {
            transform_version != 3
        } else {
            transform_version != 0
        };
        let transform_length = if transformed {
            read_woff2_base128(bytes, &mut cursor, bytes.len())?
        } else {
            original_length
        };
        total_uncompressed_length += if transformed {
            transform_length
        } else {
            original_length
        };
        entries.push(Woff2TableEntry {
            original_length,
            tag,
            transform_length,
            transform_version,
            transformed,
        });
    }
    return Some(Woff2TableDirectory {
        entries,
        stream_start: cursor,
        total_uncompressed_length,
    });
}
