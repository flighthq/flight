// flight-lint: allow-file(f64) path geometry and shape command coordinates use the canonical f64 lane; font metrics and SWF scalar state remain f32
use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Ref;
use flight_font::{GlyphOutlineMetrics, GlyphOutlineSource, create_glyph_outline_source};
use flight_geometry::{create_matrix, create_rectangle};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_path::{Path, PathCommand, PathWinding, create_path, get_path_bounds, transform_path};
use flight_shape::{
    Shape, append_shape_begin_fill, append_shape_end_fill, append_shape_line_to,
    append_shape_move_to, append_shape_quadratic_curve_to, create_shape, get_shape_fill_regions,
};

use crate::{SwfReader, create_swf_glyph_shape};

struct SwfDerivedGlyphData {
    advances: Vec<f32>,
    metrics: GlyphOutlineMetrics,
}

struct SwfFontMetadata {
    advances: Option<Vec<f32>>,
    codepoint_to_glyph_index: HashMap<u32, i32>,
    metrics: Option<GlyphOutlineMetrics>,
}

pub fn create_swf_text_shape(
    reader: &mut SwfReader,
    version: u32,
    fonts: &HashMap<u32, Arc<GlyphOutlineSource>>,
) -> Option<Ref<Shape>> {
    let glyph_bits = reader.read_uint8();
    let advance_bits = reader.read_uint8();
    if !reader.valid {
        return None;
    }

    let shape = create_shape();
    let mut glyph_outline = create_path();
    let mut font: Option<Arc<GlyphOutlineSource>> = None;
    let mut units_per_em = f64::from(DEFAULT_FONT_UNITS_PER_EM);
    let mut color = 0x000000ff;
    let mut height = 0.0_f64;
    let mut x = 0.0_f64;
    let mut y = 0.0_f64;

    for _ in 0..MAX_TEXT_RECORDS {
        let flags = reader.read_uint8();
        if !reader.valid {
            return None;
        }
        if flags == 0 {
            return Some(shape);
        }
        if flags & TEXT_RECORD_TYPE == 0 {
            return None;
        }
        if flags & TEXT_HAS_FONT != 0 {
            let font_id = u32::from(reader.read_uint16());
            font = fonts.get(&font_id).cloned();
            units_per_em = font
                .as_ref()
                .map(|source| f64::from((source.get_glyph_outline_metrics)().units_per_em))
                .unwrap_or(f64::from(DEFAULT_FONT_UNITS_PER_EM));
        }
        if flags & TEXT_HAS_COLOR != 0 {
            let red = reader.read_uint8();
            let green = reader.read_uint8();
            let blue = reader.read_uint8();
            let alpha = if version >= 2 {
                reader.read_uint8()
            } else {
                0xff
            };
            color = u32::from(red) << 24
                | u32::from(green) << 16
                | u32::from(blue) << 8
                | u32::from(alpha);
        }
        if flags & TEXT_HAS_X_OFFSET != 0 {
            x = f64::from(swf_text_read_offset(reader));
        }
        if flags & TEXT_HAS_Y_OFFSET != 0 {
            y = f64::from(swf_text_read_offset(reader));
        }
        if flags & TEXT_HAS_FONT != 0 {
            height = f64::from(reader.read_uint16());
        }
        let glyph_count = reader.read_uint8();
        if !reader.valid {
            return None;
        }
        let scale = if units_per_em == 0.0 {
            0.0
        } else {
            height / units_per_em
        };
        for _ in 0..glyph_count {
            let index = reader.read_unsigned_bits(glyph_bits);
            let advance = reader.read_signed_bits(advance_bits);
            if !reader.valid {
                return None;
            }
            if let Some(source) = &font
                && let Some(index) = swf_text_resolve_glyph_index(index)
                && scale > 0.0
                && (source.get_glyph_outline)(&mut glyph_outline, index)
            {
                swf_text_append_glyph_outline(
                    &shape,
                    &glyph_outline,
                    color,
                    scale,
                    x / TWIPS_PER_PIXEL,
                    y / TWIPS_PER_PIXEL,
                );
            }
            x += advance;
        }
        reader.align_to_byte();
    }
    return None;
}

pub fn read_swf_font_glyph_outline_source(
    reader: &mut SwfReader,
    version: u32,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    character_id: Option<u32>,
) -> Option<Arc<GlyphOutlineSource>> {
    let mut glyph_reader = SwfReader::new(reader.source.clone(), reader.pos, reader.end);
    let glyphs = read_swf_font_glyphs(&mut glyph_reader, version)?;
    let outlines: Vec<Option<Path>> = glyphs
        .iter()
        .map(swf_text_create_glyph_outline_path)
        .collect();
    let lost_glyphs = outlines.iter().filter(|outline| outline.is_none()).count();
    if lost_glyphs > 0 {
        let mut detail = HashMap::new();
        detail.insert(
            "capability".to_string(),
            ImportDiagnosticDetailValue::String(if version == 1 {
                "swf.font.define-font".to_string()
            } else {
                format!("swf.font.define-font-{version}")
            }),
        );
        detail.insert(
            "characterId".to_string(),
            ImportDiagnosticDetailValue::Number(character_id.unwrap_or(0) as f32),
        );
        detail.insert(
            "glyphCount".to_string(),
            ImportDiagnosticDetailValue::Number(outlines.len() as f32),
        );
        detail.insert(
            "lostGlyphs".to_string(),
            ImportDiagnosticDetailValue::Number(lost_glyphs as f32),
        );
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "swf.font-glyph-outline",
            "readSwfFontGlyphOutlineSource",
            Some(detail),
        );
    }

    let fallback =
        swf_text_derive_glyph_outline_data(&outlines, resolve_swf_font_units_per_em(version));
    let metadata = if version == 1 {
        None
    } else {
        swf_text_read_font_metadata(reader, version, outlines.len())
    };
    let advances = Arc::new(
        metadata
            .as_ref()
            .and_then(|value| value.advances.clone())
            .unwrap_or(fallback.advances),
    );
    let codepoints = Arc::new(
        metadata
            .as_ref()
            .map(|value| value.codepoint_to_glyph_index.clone())
            .unwrap_or_default(),
    );
    let metrics = Arc::new(
        metadata
            .and_then(|value| value.metrics)
            .unwrap_or(fallback.metrics),
    );
    let outlines = Arc::new(outlines);

    let outline_source = outlines.clone();
    let advance_source = advances.clone();
    let codepoint_source = codepoints.clone();
    let metrics_source = metrics.clone();
    return Some(Arc::new(create_glyph_outline_source(
        Arc::new(move |out, glyph_index| {
            out.commands.clear();
            out.data.clear();
            out.winding = PathWinding::NonZero;
            let Some(outline) = usize::try_from(glyph_index)
                .ok()
                .and_then(|index| outline_source.get(index))
                .and_then(Option::as_ref)
            else {
                return false;
            };
            out.commands.extend_from_slice(&outline.commands);
            out.data.extend_from_slice(&outline.data);
            out.winding = outline.winding;
            return true;
        }),
        Arc::new(move |glyph_index| {
            return usize::try_from(glyph_index)
                .ok()
                .and_then(|index| advance_source.get(index))
                .copied()
                .unwrap_or(0.0);
        }),
        Arc::new(move |code_point| {
            return codepoint_source.get(&code_point).copied().unwrap_or(-1);
        }),
        Arc::new(move || metrics_source.clone()),
    )));
}

pub fn read_swf_font_glyphs(
    reader: &mut SwfReader,
    version: u32,
) -> Option<Vec<Option<Ref<Shape>>>> {
    reader.read_uint16();
    if version == 1 {
        let table_start = reader.pos;
        let offsets = swf_text_read_legacy_font_offsets(reader, table_start)?;
        return swf_text_read_font_glyph_shapes(reader, &offsets, table_start);
    }
    let flags = reader.read_uint8();
    let has_wide_offsets = flags & FONT_FLAG_WIDE_OFFSETS != 0;
    reader.read_uint8();
    let name_length = reader.read_uint8();
    for _ in 0..name_length {
        reader.read_uint8();
    }
    let glyph_count = u32::from(reader.read_uint16());
    if !reader.valid || glyph_count > MAX_FONT_GLYPHS {
        return None;
    }
    let table_start = reader.pos;
    let offsets = swf_text_read_font_offsets(reader, glyph_count, has_wide_offsets)?;
    return swf_text_read_font_glyph_shapes(reader, &offsets, table_start);
}

pub fn resolve_swf_font_units_per_em(version: u32) -> f32 {
    return if version == 3 {
        DEFAULT_FONT_UNITS_PER_EM * TWIPS_PER_PIXEL as f32
    } else {
        DEFAULT_FONT_UNITS_PER_EM
    };
}

fn swf_text_append_glyph_outline(
    target: &Ref<Shape>,
    glyph: &Path,
    color: u32,
    scale: f64,
    offset_x: f64,
    offset_y: f64,
) {
    append_shape_begin_fill(target, color, Some(1.0));
    let mut data_index = 0;
    for command in &glyph.commands {
        if *command == PathCommand::MoveTo as u8 {
            append_shape_move_to(
                target,
                glyph.data[data_index] * scale / TWIPS_PER_PIXEL + offset_x,
                glyph.data[data_index + 1] * scale / TWIPS_PER_PIXEL + offset_y,
            );
            data_index += 2;
        } else if *command == PathCommand::LineTo as u8 {
            append_shape_line_to(
                target,
                glyph.data[data_index] * scale / TWIPS_PER_PIXEL + offset_x,
                glyph.data[data_index + 1] * scale / TWIPS_PER_PIXEL + offset_y,
            );
            data_index += 2;
        } else if *command == PathCommand::QuadraticCurveTo as u8 {
            append_shape_quadratic_curve_to(
                target,
                glyph.data[data_index] * scale / TWIPS_PER_PIXEL + offset_x,
                glyph.data[data_index + 1] * scale / TWIPS_PER_PIXEL + offset_y,
                glyph.data[data_index + 2] * scale / TWIPS_PER_PIXEL + offset_x,
                glyph.data[data_index + 3] * scale / TWIPS_PER_PIXEL + offset_y,
            );
            data_index += 4;
        }
    }
    append_shape_end_fill(target);
}

fn swf_text_create_glyph_outline_path(glyph: &Option<Ref<Shape>>) -> Option<Path> {
    let glyph = glyph.as_ref()?;
    let regions = get_shape_fill_regions(&glyph.read().unwrap().data.commands)?;
    let mut outline = create_path();
    outline.winding = PathWinding::NonZero;
    let matrix = create_matrix(20.0, 0.0, 0.0, 20.0, 0.0, 0.0);
    for region in regions {
        let guard = region.path.read().unwrap();
        let mut restored = create_path();
        restored.winding = guard.winding;
        transform_path(&guard, &matrix, &mut restored);
        outline.commands.extend_from_slice(&restored.commands);
        outline.data.extend_from_slice(&restored.data);
    }
    return Some(outline);
}

fn swf_text_derive_glyph_outline_data(
    outlines: &[Option<Path>],
    units_per_em: f32,
) -> SwfDerivedGlyphData {
    let mut advances = Vec::new();
    let mut min_y = f32::INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for outline in outlines {
        let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let Some(outline) = outline else {
            advances.push(0.0);
            continue;
        };
        if !get_path_bounds(outline, &mut bounds) {
            advances.push(0.0);
            continue;
        }
        advances.push((bounds.x + bounds.width).max(0.0));
        min_y = min_y.min(bounds.y);
        max_y = max_y.max(bounds.y + bounds.height);
    }
    let has_vertical_ink = min_y != f32::INFINITY;
    return SwfDerivedGlyphData {
        advances,
        metrics: GlyphOutlineMetrics {
            ascent: if has_vertical_ink {
                (-min_y).max(0.0)
            } else {
                units_per_em * DEFAULT_ASCENT_RATIO
            },
            descent: if has_vertical_ink {
                max_y.max(0.0)
            } else {
                units_per_em * (1.0 - DEFAULT_ASCENT_RATIO)
            },
            line_gap: 0.0,
            units_per_em,
        },
    };
}

fn swf_text_read_font_glyph_shapes(
    reader: &SwfReader,
    offsets: &[u32],
    table_start: usize,
) -> Option<Vec<Option<Ref<Shape>>>> {
    if offsets.len() < 2 {
        return Some(Vec::new());
    }
    let mut glyphs = Vec::new();
    for index in 0..offsets.len() - 1 {
        let start = table_start.checked_add(offsets[index] as usize)?;
        let end = table_start.checked_add(offsets[index + 1] as usize)?;
        if start < table_start || end > reader.end || end < start {
            return None;
        }
        let mut glyph_reader = SwfReader::new(reader.source.clone(), start, end);
        glyphs.push(create_swf_glyph_shape(&mut glyph_reader));
    }
    return Some(glyphs);
}

fn swf_text_read_font_metadata(
    reader: &mut SwfReader,
    version: u32,
    expected_glyph_count: usize,
) -> Option<SwfFontMetadata> {
    reader.read_uint16();
    let flags = reader.read_uint8();
    let has_layout = flags & FONT_FLAG_HAS_LAYOUT != 0;
    let has_wide_codes = flags & FONT_FLAG_WIDE_CODES != 0;
    let has_wide_offsets = flags & FONT_FLAG_WIDE_OFFSETS != 0;
    reader.read_uint8();
    let name_length = reader.read_uint8();
    for _ in 0..name_length {
        reader.read_uint8();
    }
    let glyph_count = u32::from(reader.read_uint16());
    if !reader.valid || glyph_count as usize != expected_glyph_count {
        return None;
    }
    let table_start = reader.pos;
    let offsets = swf_text_read_font_offsets(reader, glyph_count, has_wide_offsets)?;
    let code_table_start = table_start.checked_add(*offsets.last()? as usize)?;
    if code_table_start < reader.pos || code_table_start > reader.end {
        return None;
    }
    reader.pos = code_table_start;
    let mut codepoint_to_glyph_index = HashMap::new();
    for glyph_index in 0..glyph_count {
        let code_point = if has_wide_codes {
            u32::from(reader.read_uint16())
        } else {
            u32::from(reader.read_uint8())
        };
        if reader.valid {
            codepoint_to_glyph_index
                .entry(code_point)
                .or_insert(glyph_index as i32);
        }
    }
    if !reader.valid {
        return None;
    }
    if !has_layout {
        return Some(SwfFontMetadata {
            advances: None,
            codepoint_to_glyph_index,
            metrics: None,
        });
    }
    let metrics = GlyphOutlineMetrics {
        ascent: swf_text_read_signed_uint16(reader) as f32,
        descent: swf_text_read_signed_uint16(reader) as f32,
        line_gap: swf_text_read_signed_uint16(reader) as f32,
        units_per_em: resolve_swf_font_units_per_em(version),
    };
    let mut advances = Vec::new();
    for _ in 0..glyph_count {
        advances.push(swf_text_read_signed_uint16(reader) as f32);
    }
    for _ in 0..glyph_count {
        swf_text_skip_rectangle(reader);
    }
    let kerning_count = reader.read_uint16();
    for _ in 0..kerning_count {
        if has_wide_codes {
            reader.read_uint16();
            reader.read_uint16();
        } else {
            reader.read_uint8();
            reader.read_uint8();
        }
        reader.read_uint16();
    }
    return reader.valid.then_some(SwfFontMetadata {
        advances: Some(advances),
        codepoint_to_glyph_index,
        metrics: Some(metrics),
    });
}

fn swf_text_read_font_offsets(
    reader: &mut SwfReader,
    glyph_count: u32,
    has_wide_offsets: bool,
) -> Option<Vec<u32>> {
    let mut offsets = Vec::new();
    for _ in 0..=glyph_count {
        offsets.push(if has_wide_offsets {
            reader.read_uint32()
        } else {
            u32::from(reader.read_uint16())
        });
    }
    return reader.valid.then_some(offsets);
}

fn swf_text_read_legacy_font_offsets(
    reader: &mut SwfReader,
    table_start: usize,
) -> Option<Vec<u32>> {
    let first = u32::from(reader.read_uint16());
    if !reader.valid || first < 2 || !first.is_multiple_of(2) || first / 2 > MAX_FONT_GLYPHS {
        return None;
    }
    let mut offsets = vec![first];
    for _ in 1..first / 2 {
        offsets.push(u32::from(reader.read_uint16()));
    }
    offsets.push(u32::try_from(reader.end.checked_sub(table_start)?).ok()?);
    return reader.valid.then_some(offsets);
}

fn swf_text_read_offset(reader: &mut SwfReader) -> i32 {
    return i32::from(reader.read_uint16() as i16);
}

fn swf_text_read_signed_uint16(reader: &mut SwfReader) -> i32 {
    return i32::from(reader.read_uint16() as i16);
}

fn swf_text_resolve_glyph_index(value: f64) -> Option<i32> {
    if !(0.0..=f64::from(i32::MAX)).contains(&value) {
        return None;
    }
    return Some(value as i32);
}

fn swf_text_skip_rectangle(reader: &mut SwfReader) {
    let bits = reader.read_unsigned_bits(5) as u8;
    for _ in 0..4 {
        reader.read_signed_bits(bits);
    }
    reader.align_to_byte();
}

const DEFAULT_ASCENT_RATIO: f32 = 0.8;
const DEFAULT_FONT_UNITS_PER_EM: f32 = 1024.0;
const FONT_FLAG_HAS_LAYOUT: u8 = 0x80;
const FONT_FLAG_WIDE_CODES: u8 = 0x04;
const FONT_FLAG_WIDE_OFFSETS: u8 = 0x08;
const MAX_FONT_GLYPHS: u32 = 0xffff;
const MAX_TEXT_RECORDS: usize = 100_000;
const TEXT_HAS_COLOR: u8 = 0x04;
const TEXT_HAS_FONT: u8 = 0x08;
const TEXT_HAS_X_OFFSET: u8 = 0x01;
const TEXT_HAS_Y_OFFSET: u8 = 0x02;
const TEXT_RECORD_TYPE: u8 = 0x80;
const TWIPS_PER_PIXEL: f64 = 20.0;
