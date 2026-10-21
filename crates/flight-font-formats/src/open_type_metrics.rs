use flight_entity::{Int32Array, Uint8Array};
use flight_font::GlyphOutlineMetrics;

use crate::binary::{signed16, unsigned16};
use crate::types::SfntTableDirectory;

pub fn read_open_type_advances(
    bytes: &Uint8Array,
    directory: &SfntTableDirectory,
    glyph_count: usize,
) -> Option<Box<Int32Array>> {
    let hhea = directory.tables.get("hhea")?;
    let hmtx = directory.tables.get("hmtx")?;
    if hhea.length < 36 {
        return None;
    }
    let long_metric_count = usize::from(unsigned16(bytes, hhea.offset + 34));
    if long_metric_count == 0 || long_metric_count * 4 > hmtx.length {
        return None;
    }
    let mut advances = vec![0; glyph_count];
    let mut last_advance = 0;
    for glyph in 0..glyph_count {
        if glyph < long_metric_count {
            last_advance = i32::from(unsigned16(bytes, hmtx.offset + glyph * 4));
        }
        advances[glyph] = last_advance;
    }
    return Some(advances.into_boxed_slice());
}

pub fn read_open_type_glyph_count(bytes: &Uint8Array, directory: &SfntTableDirectory) -> i32 {
    let Some(maxp) = directory.tables.get("maxp") else {
        return -1;
    };
    if maxp.length < 6 {
        return -1;
    }
    return i32::from(unsigned16(bytes, maxp.offset + 4));
}

pub fn read_open_type_loca_format(bytes: &Uint8Array, directory: &SfntTableDirectory) -> i32 {
    let Some(head) = directory.tables.get("head") else {
        return -1;
    };
    if head.length < 54 {
        return -1;
    }
    let format = signed16(bytes, head.offset + 50);
    return if format == 0 || format == 1 {
        i32::from(format)
    } else {
        -1
    };
}

pub fn read_open_type_metrics(
    bytes: &Uint8Array,
    directory: &SfntTableDirectory,
) -> Option<GlyphOutlineMetrics> {
    let head = directory.tables.get("head")?;
    let hhea = directory.tables.get("hhea")?;
    if head.length < 54 || hhea.length < 36 {
        return None;
    }
    let units_per_em = unsigned16(bytes, head.offset + 18);
    if units_per_em == 0 {
        return None;
    }
    return Some(GlyphOutlineMetrics {
        ascent: f32::from(signed16(bytes, hhea.offset + 4)),
        descent: -f32::from(signed16(bytes, hhea.offset + 6)),
        line_gap: f32::from(signed16(bytes, hhea.offset + 8)),
        units_per_em: f32::from(units_per_em),
    });
}
