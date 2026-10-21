use std::collections::HashMap;

use flight_entity::Uint8Array;

use crate::binary::{to_uint32, unsigned16, unsigned32, write16, write32};
use crate::sfnt_table_directory::read_sfnt_tag;

#[derive(Clone, Debug, PartialEq)]
pub struct SyntheticGlyph {
    pub end_points: Vec<f32>,
    pub points: Vec<SyntheticGlyphPoint>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SyntheticGlyphPoint {
    pub x: f32,
    pub y: f32,
    pub on_curve: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SyntheticCidOptions {
    pub fd_select: Vec<f32>,
    pub pools: Vec<Vec<Box<Uint8Array>>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SyntheticFontFlavor {
    OpenType,
    TrueType,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SyntheticFontOptions {
    pub advances: Option<Vec<f32>>,
    pub codepoints: Option<HashMap<u32, i32>>,
    pub charstrings: Option<Vec<Box<Uint8Array>>>,
    pub cid: Option<SyntheticCidOptions>,
    pub glyphs: Option<Vec<SyntheticGlyph>>,
    pub flavor: Option<SyntheticFontFlavor>,
    pub omit_table: Option<String>,
    pub units_per_em: Option<f32>,
}

struct SyntheticTable {
    data: Box<Uint8Array>,
    tag: String,
}

const WOFF2_KNOWN_TAGS: [&str; 63] = [
    "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca",
    "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea",
    "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL",
    "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
    "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
    "Gloc", "Feat", "Sill",
];

pub fn create_synthetic_font(options: Option<&SyntheticFontOptions>) -> Box<Uint8Array> {
    let defaults = SyntheticFontOptions::default();
    let options = options.unwrap_or(&defaults);
    let flavor = options.flavor.unwrap_or(SyntheticFontFlavor::TrueType);
    let default_glyphs = vec![empty_synthetic_glyph()];
    let default_charstrings: Vec<Box<Uint8Array>> = vec![vec![14].into_boxed_slice()];
    let glyphs = options.glyphs.as_ref().unwrap_or(&default_glyphs);
    let charstrings = options.charstrings.as_ref().unwrap_or(&default_charstrings);
    let glyph_count = if flavor == SyntheticFontFlavor::TrueType {
        glyphs.len()
    } else {
        charstrings.len()
    };
    let default_advances = vec![500.0; glyph_count];
    let advances = options.advances.as_ref().unwrap_or(&default_advances);
    let glyph_data: Vec<Box<Uint8Array>> = glyphs.iter().map(encode_synthetic_glyph).collect();
    let mut loca_offsets = vec![0usize];
    let mut running = 0;
    for data in &glyph_data {
        running += data.len();
        loca_offsets.push(running);
    }
    let mut tables = vec![
        SyntheticTable {
            data: encode_synthetic_head(options.units_per_em.unwrap_or(1000.0)),
            tag: "head".to_string(),
        },
        SyntheticTable {
            data: encode_synthetic_hhea(advances.len()),
            tag: "hhea".to_string(),
        },
        SyntheticTable {
            data: encode_synthetic_maxp(glyph_count),
            tag: "maxp".to_string(),
        },
        SyntheticTable {
            data: encode_synthetic_hmtx(advances),
            tag: "hmtx".to_string(),
        },
        SyntheticTable {
            data: encode_synthetic_cmap(options.codepoints.as_ref()),
            tag: "cmap".to_string(),
        },
    ];
    if flavor == SyntheticFontFlavor::TrueType {
        tables.push(SyntheticTable {
            data: encode_synthetic_loca(&loca_offsets),
            tag: "loca".to_string(),
        });
        tables.push(SyntheticTable {
            data: concatenate_bytes(&glyph_data),
            tag: "glyf".to_string(),
        });
    } else {
        tables.push(SyntheticTable {
            data: encode_synthetic_cff(charstrings, options.cid.as_ref()),
            tag: "CFF ".to_string(),
        });
    }
    if let Some(omitted) = &options.omit_table {
        tables.retain(|table| &table.tag != omitted);
    }
    return assemble_synthetic_sfnt(
        if flavor == SyntheticFontFlavor::TrueType {
            0x00010000
        } else {
            0x4f54544f
        },
        &tables,
    );
}

fn assemble_synthetic_sfnt(
    sfnt_version: u32,
    ordered_tables: &[SyntheticTable],
) -> Box<Uint8Array> {
    let mut sorted: Vec<&SyntheticTable> = ordered_tables.iter().collect();
    sorted.sort_by(|a, b| a.tag.cmp(&b.tag));
    let header_bytes = 12 + sorted.len() * 16;
    let total = header_bytes
        + sorted
            .iter()
            .map(|table| (table.data.len() + 3) & !3)
            .sum::<usize>();
    let mut bytes = vec![0; total];
    write32(&mut bytes, 0, sfnt_version);
    write16(&mut bytes, 4, sorted.len() as u16);
    let mut data_offset = header_bytes;
    for (index, table) in sorted.iter().enumerate() {
        let record = 12 + index * 16;
        for (character, value) in table.tag.encode_utf16().take(4).enumerate() {
            bytes[record + character] = value as u8;
        }
        write32(&mut bytes, record + 8, data_offset as u32);
        write32(&mut bytes, record + 12, table.data.len() as u32);
        bytes[data_offset..data_offset + table.data.len()].copy_from_slice(&table.data);
        data_offset += (table.data.len() + 3) & !3;
    }
    return bytes.into_boxed_slice();
}

fn base128(value: usize) -> Vec<u8> {
    let mut groups = Vec::new();
    let mut remaining = value;
    loop {
        groups.insert(0, (remaining & 127) as u8);
        remaining /= 128;
        if remaining == 0 {
            break;
        }
    }
    let count = groups.len();
    for index in 0..count - 1 {
        groups[index] |= 128;
    }
    return groups;
}

pub fn cff_operand(value: f32) -> f32 {
    return value + 139.0;
}

fn concatenate_bytes(chunks: &[Box<Uint8Array>]) -> Box<Uint8Array> {
    let mut out = Vec::new();
    for chunk in chunks {
        out.extend_from_slice(chunk);
    }
    return out.into_boxed_slice();
}

pub fn empty_synthetic_glyph() -> SyntheticGlyph {
    return SyntheticGlyph {
        end_points: Vec::new(),
        points: Vec::new(),
    };
}

fn encode_cff_index(entries: &[Box<Uint8Array>]) -> Box<Uint8Array> {
    if entries.is_empty() {
        return vec![0, 0].into_boxed_slice();
    }
    let mut offsets = vec![1];
    for entry in entries {
        offsets.push(offsets[offsets.len() - 1] + entry.len());
    }
    let mut bytes = vec![0; 3 + offsets.len() * 4];
    write16(&mut bytes, 0, entries.len() as u16);
    bytes[2] = 4;
    for (index, offset) in offsets.iter().enumerate() {
        write32(&mut bytes, 3 + index * 4, *offset as u32);
    }
    for entry in entries {
        bytes.extend_from_slice(entry);
    }
    return bytes.into_boxed_slice();
}

pub fn encode_synthetic_cff(
    charstrings: &[Box<Uint8Array>],
    cid: Option<&SyntheticCidOptions>,
) -> Box<Uint8Array> {
    let name = encode_cff_index(&[vec![0x46].into_boxed_slice()]);
    let strings = encode_cff_index(&[]);
    let gsubrs = encode_cff_index(&[]);
    let charstrings_index = encode_cff_index(charstrings);
    let header = vec![1, 0, 4, 1].into_boxed_slice();
    let top_dict_body = |offset: usize| {
        let mut bytes = vec![29];
        bytes.extend_from_slice(&(offset as u32).to_be_bytes());
        bytes.push(17);
        return bytes.into_boxed_slice();
    };
    let Some(cid) = cid else {
        let probe = encode_cff_index(&[top_dict_body(0)]);
        let charstrings_at = header.len() + name.len() + probe.len() + strings.len() + gsubrs.len();
        let top_dicts = encode_cff_index(&[top_dict_body(charstrings_at)]);
        return concatenate_bytes(&[header, name, top_dicts, strings, gsubrs, charstrings_index]);
    };
    let mut fd_select = vec![0];
    for fd in &cid.fd_select {
        fd_select.push(to_uint32(*fd) as u8);
    }
    let cid_top = |charstrings_at: usize, fd_array_at: usize, fd_select_at: usize| {
        let mut bytes = vec![139, 139, 139, 12, 30];
        bytes.push(29);
        bytes.extend_from_slice(&(charstrings_at as u32).to_be_bytes());
        bytes.push(17);
        bytes.push(29);
        bytes.extend_from_slice(&(fd_array_at as u32).to_be_bytes());
        bytes.extend_from_slice(&[12, 36]);
        bytes.push(29);
        bytes.extend_from_slice(&(fd_select_at as u32).to_be_bytes());
        bytes.extend_from_slice(&[12, 37]);
        return bytes.into_boxed_slice();
    };
    let mut privates = Vec::new();
    for pool in &cid.pools {
        let mut dict = vec![29, 0, 0, 0, 6, 19];
        dict.extend_from_slice(&encode_cff_index(pool));
        privates.push(dict.into_boxed_slice());
    }
    let probe_top = encode_cff_index(&[cid_top(0, 0, 0)]);
    let charstrings_at = header.len() + name.len() + probe_top.len() + strings.len() + gsubrs.len();
    let mut running = charstrings_at + charstrings_index.len();
    let mut font_dicts = Vec::new();
    for entry in &privates {
        let mut dict = vec![29, 0, 0, 0, 6, 29];
        dict.extend_from_slice(&(running as u32).to_be_bytes());
        dict.push(18);
        font_dicts.push(dict.into_boxed_slice());
        running += entry.len();
    }
    let fd_array = encode_cff_index(&font_dicts);
    let top_dicts = encode_cff_index(&[cid_top(charstrings_at, running, running + fd_array.len())]);
    let mut chunks = vec![header, name, top_dicts, strings, gsubrs, charstrings_index];
    chunks.extend(privates);
    chunks.push(fd_array);
    chunks.push(fd_select.into_boxed_slice());
    return concatenate_bytes(&chunks);
}

fn encode_synthetic_cmap(codepoints: Option<&HashMap<u32, i32>>) -> Box<Uint8Array> {
    let mut entries: Vec<u32> = codepoints
        .map(|map| map.keys().copied().collect())
        .unwrap_or_else(Vec::new);
    entries.sort();
    let segment_count = entries.len() + 1;
    let subtable_length = 16 + segment_count * 8;
    let mut bytes = vec![0; 12 + subtable_length];
    write16(&mut bytes, 2, 1);
    write16(&mut bytes, 4, 3);
    write16(&mut bytes, 6, 1);
    write32(&mut bytes, 8, 12);
    write16(&mut bytes, 12, 4);
    write16(&mut bytes, 14, subtable_length as u16);
    write16(&mut bytes, 18, (segment_count * 2) as u16);
    let ends = 26;
    let starts = ends + segment_count * 2 + 2;
    let deltas = starts + segment_count * 2;
    let ranges = deltas + segment_count * 2;
    entries.push(0xffff);
    for (index, codepoint) in entries.iter().enumerate() {
        let glyph = if index == segment_count - 1 {
            0
        } else {
            *codepoints.unwrap().get(codepoint).unwrap()
        };
        write16(&mut bytes, ends + index * 2, *codepoint as u16);
        write16(&mut bytes, starts + index * 2, *codepoint as u16);
        write16(
            &mut bytes,
            deltas + index * 2,
            (glyph as u32).wrapping_sub(*codepoint) as u16,
        );
        write16(&mut bytes, ranges + index * 2, 0);
    }
    return bytes.into_boxed_slice();
}

fn encode_synthetic_glyph(glyph: &SyntheticGlyph) -> Box<Uint8Array> {
    if glyph.points.is_empty() {
        return Vec::new().into_boxed_slice();
    }
    let mut bytes = vec![0; 10 + glyph.end_points.len() * 2 + 2 + glyph.points.len() * 5];
    write16(&mut bytes, 0, glyph.end_points.len() as u16);
    let mut cursor = 10;
    for end in &glyph.end_points {
        write16(&mut bytes, cursor, to_uint32(*end) as u16);
        cursor += 2;
    }
    write16(&mut bytes, cursor, 0);
    cursor += 2;
    for point in &glyph.points {
        bytes[cursor] = u8::from(point.on_curve);
        cursor += 1;
    }
    let mut previous = 0.0;
    for point in &glyph.points {
        write16(&mut bytes, cursor, to_uint32(point.x - previous) as u16);
        previous = point.x;
        cursor += 2;
    }
    previous = 0.0;
    for point in &glyph.points {
        write16(&mut bytes, cursor, to_uint32(point.y - previous) as u16);
        previous = point.y;
        cursor += 2;
    }
    return bytes.into_boxed_slice();
}

fn encode_synthetic_head(units_per_em: f32) -> Box<Uint8Array> {
    let mut bytes = vec![0; 54];
    write32(&mut bytes, 0, 0x00010000);
    write16(&mut bytes, 18, to_uint32(units_per_em) as u16);
    write16(&mut bytes, 50, 1);
    return bytes.into_boxed_slice();
}

fn encode_synthetic_hhea(long_metric_count: usize) -> Box<Uint8Array> {
    let mut bytes = vec![0; 36];
    write16(&mut bytes, 4, 800);
    write16(&mut bytes, 6, (-200i16) as u16);
    write16(&mut bytes, 8, 100);
    write16(&mut bytes, 34, long_metric_count as u16);
    return bytes.into_boxed_slice();
}

fn encode_synthetic_hmtx(advances: &Vec<f32>) -> Box<Uint8Array> {
    let mut bytes = vec![0; advances.len() * 4];
    for (index, value) in advances.iter().enumerate() {
        write16(&mut bytes, index * 4, to_uint32(*value) as u16);
    }
    return bytes.into_boxed_slice();
}

fn encode_synthetic_loca(offsets: &[usize]) -> Box<Uint8Array> {
    let mut bytes = vec![0; offsets.len() * 4];
    for (index, value) in offsets.iter().enumerate() {
        write32(&mut bytes, index * 4, *value as u32);
    }
    return bytes.into_boxed_slice();
}

fn encode_synthetic_maxp(glyph_count: usize) -> Box<Uint8Array> {
    let mut bytes = vec![0; 6];
    write32(&mut bytes, 0, 0x00010000);
    write16(&mut bytes, 4, glyph_count as u16);
    return bytes.into_boxed_slice();
}

pub fn encode_synthetic_woff(
    sfnt: &Uint8Array,
    reverse_table_order: Option<bool>,
) -> Box<Uint8Array> {
    let table_count = usize::from(unsigned16(sfnt, 4));
    let header = 44 + table_count * 20;
    let mut entries = Vec::new();
    let mut total = header;
    for index in 0..table_count {
        let record = 12 + index * 16;
        let tag = unsigned32(sfnt, record);
        let offset = unsigned32(sfnt, record + 8) as usize;
        let length = unsigned32(sfnt, record + 12) as usize;
        let data = sfnt[offset.min(sfnt.len())..(offset + length).min(sfnt.len())]
            .to_vec()
            .into_boxed_slice();
        entries.push((tag, data));
        total += (length + 3) & !3;
    }
    if reverse_table_order.unwrap_or(false) {
        entries.reverse();
    }
    let mut out = vec![0; total];
    write32(&mut out, 0, 0x774f4646);
    write32(&mut out, 4, unsigned32(sfnt, 0));
    write32(&mut out, 8, total as u32);
    write16(&mut out, 12, table_count as u16);
    let mut data_at = header;
    for (index, (tag, data)) in entries.iter().enumerate() {
        let record = 44 + index * 20;
        write32(&mut out, record, *tag);
        write32(&mut out, record + 4, data_at as u32);
        write32(&mut out, record + 8, data.len() as u32);
        write32(&mut out, record + 12, data.len() as u32);
        write32(
            &mut out,
            record + 16,
            synthetic_table_checksum(data, *tag == 0x68656164),
        );
        out[data_at..data_at + data.len()].copy_from_slice(data);
        data_at += (data.len() + 3) & !3;
    }
    return out.into_boxed_slice();
}

pub fn encode_synthetic_woff2(
    sfnt: &Uint8Array,
    transform_tags: Option<&[String]>,
) -> Box<Uint8Array> {
    let count = usize::from(unsigned16(sfnt, 4));
    let mut ordered_tables = Vec::new();
    for index in 0..count {
        let record = 12 + index * 16;
        let tag = read_sfnt_tag(sfnt, record);
        let offset = unsigned32(sfnt, record + 8) as usize;
        let length = unsigned32(sfnt, record + 12) as usize;
        ordered_tables.push(SyntheticTable {
            data: sfnt[offset.min(sfnt.len())..(offset + length).min(sfnt.len())]
                .to_vec()
                .into_boxed_slice(),
            tag,
        });
    }
    let mut directory = Vec::new();
    let mut stream = Vec::new();
    for table in &ordered_tables {
        let known = WOFF2_KNOWN_TAGS.iter().position(|tag| *tag == table.tag);
        let transformed = transform_tags.is_some_and(|tags| tags.contains(&table.tag));
        let is_glyph_pair = table.tag == "glyf" || table.tag == "loca";
        let version = if is_glyph_pair {
            if transformed { 0 } else { 3 }
        } else if transformed {
            1
        } else {
            0
        };
        directory.push((version << 6) | known.unwrap_or(63) as u8);
        if known.is_none() {
            for character in table
                .tag
                .encode_utf16()
                .chain(std::iter::repeat(32))
                .take(4)
            {
                directory.push(character as u8);
            }
        }
        directory.extend(base128(table.data.len()));
        if transformed {
            directory.extend(base128(table.data.len()));
        }
        stream.extend_from_slice(&table.data);
    }
    let total = 48 + directory.len() + stream.len();
    let mut out = vec![0; total];
    write32(&mut out, 0, 0x774f4632);
    write32(&mut out, 4, unsigned32(sfnt, 0));
    write32(&mut out, 8, total as u32);
    write16(&mut out, 12, ordered_tables.len() as u16);
    write32(&mut out, 16, sfnt.len() as u32);
    write32(&mut out, 20, stream.len() as u32);
    out[48..48 + directory.len()].copy_from_slice(&directory);
    out[48 + directory.len()..].copy_from_slice(&stream);
    return out.into_boxed_slice();
}

// flight-lint: allow(conform-extra) D9 exact string table for the source synthetic font flavor union
pub fn get_synthetic_font_flavor_string(value: SyntheticFontFlavor) -> &'static str {
    return match value {
        SyntheticFontFlavor::OpenType => "opentype",
        SyntheticFontFlavor::TrueType => "truetype",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for the source synthetic font flavor union
pub fn parse_synthetic_font_flavor(value: &str) -> Option<SyntheticFontFlavor> {
    return match value {
        "opentype" => Some(SyntheticFontFlavor::OpenType),
        "truetype" => Some(SyntheticFontFlavor::TrueType),
        _ => None,
    };
}

pub fn ring_synthetic_glyph(
    reverse_counter: Option<bool>,
    flip_both: Option<bool>,
) -> SyntheticGlyph {
    let mut outer = square_synthetic_glyph(600.0).points;
    let mut inner = vec![
        SyntheticGlyphPoint {
            x: 200.0,
            y: 200.0,
            on_curve: true,
        },
        SyntheticGlyphPoint {
            x: 200.0,
            y: 400.0,
            on_curve: true,
        },
        SyntheticGlyphPoint {
            x: 400.0,
            y: 400.0,
            on_curve: true,
        },
        SyntheticGlyphPoint {
            x: 400.0,
            y: 200.0,
            on_curve: true,
        },
    ];
    if reverse_counter.unwrap_or(false) {
        inner.reverse();
    }
    if flip_both.unwrap_or(false) {
        outer.reverse();
        inner.reverse();
    }
    outer.extend(inner);
    return SyntheticGlyph {
        end_points: vec![3.0, 7.0],
        points: outer,
    };
}

pub fn square_synthetic_glyph(size: f32) -> SyntheticGlyph {
    return SyntheticGlyph {
        end_points: vec![3.0],
        points: vec![
            SyntheticGlyphPoint {
                x: 0.0,
                y: 0.0,
                on_curve: true,
            },
            SyntheticGlyphPoint {
                x: size,
                y: 0.0,
                on_curve: true,
            },
            SyntheticGlyphPoint {
                x: size,
                y: size,
                on_curve: true,
            },
            SyntheticGlyphPoint {
                x: 0.0,
                y: size,
                on_curve: true,
            },
        ],
    };
}

fn synthetic_table_checksum(data: &Uint8Array, is_head: bool) -> u32 {
    let mut sum = 0u32;
    for at in (0..data.len()).step_by(4) {
        let mut word = 0u32;
        for byte in 0..4 {
            word = (word << 8) | u32::from(*data.get(at + byte).unwrap_or(&0));
        }
        if is_head && at == 8 {
            word = 0;
        }
        sum = sum.wrapping_add(word);
    }
    return sum;
}
