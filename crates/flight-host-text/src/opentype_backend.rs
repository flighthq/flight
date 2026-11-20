use std::collections::{BTreeSet, HashMap, HashSet};
use std::str::FromStr;
use std::sync::{Arc, RwLock};

use flight_compression::{CompressionFraming, Decompressor, SDK_HOST_DECOMPRESS_DEFLATE};
use flight_entity::Ref;
use flight_font::{
    FontFace, FontFormatData, FontFormatUint8Array, FontVariationAxis, GlyphMetrics,
    GlyphOutlineMetrics, GlyphRasterizeOptions, GlyphRasterizedBitmap,
    allocate_glyph_rasterizer_backend_from_glyph_outline_source, create_font_resource,
    create_glyph_outline_source, detect_font_format,
};
use flight_font_formats::{SfntFontTable, assemble_sfnt_font};
use flight_geometry::create_rectangle;
use flight_host::{FontFaceHandle, ProviderRef};
use flight_path::{
    Path, PathWinding, append_path_close, append_path_cubic_curve_to, append_path_line_to,
    append_path_move_to, append_path_quadratic_curve_to, create_path, get_path_bounds,
};
use flight_textformat::{FontVariation, TextFormat};
use flight_textshaper::{
    FontMetrics, GlyphExtents, ShapedGlyph, ShapedRun, TextDirection, TextFeature,
    TextShaperOptions, create_shaped_run,
};
use rustybuzz::{
    Direction, Face as ShapingFace, Feature, Language, Script, UnicodeBuffer, Variation,
};
use ttf_parser::{Face, GlyphId, OutlineBuilder, Tag, cmap::Format};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BackendFailure {
    FaceIndexOutOfRange,
    InvalidFeature,
    MalformedFont,
    ResourceLimitExceeded,
    UnsupportedFont,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RasterFailure {
    GlyphNotFound,
    ResourceLimitExceeded,
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    #[test]
    fn shared_woff_stream_is_inflated_once_with_the_declared_hard_limit() {
        let mut bytes = vec![0_u8; 86];
        bytes[..4].copy_from_slice(b"wOFF");
        put_u32(&mut bytes, 4, 0x0001_0000);
        put_u32(&mut bytes, 8, 86);
        put_u16(&mut bytes, 12, 2);
        put_u32(&mut bytes, 16, 52);
        for (index, tag) in [*b"one ", *b"two "].into_iter().enumerate() {
            let record = 44 + index * 20;
            bytes[record..record + 4].copy_from_slice(&tag);
            put_u32(&mut bytes, record + 4, 84);
            put_u32(&mut bytes, record + 8, 2);
            put_u32(&mut bytes, record + 12, 4);
        }
        bytes[84..].copy_from_slice(&[1, 2]);
        let calls = Arc::new(AtomicUsize::new(0));
        let retained = calls.clone();
        let decompress: Decompressor = Arc::new(move |input, limit, framing| {
            assert_eq!(input, &[1, 2]);
            assert_eq!(limit, 4);
            assert_eq!(framing, CompressionFraming::Rfc1950);
            retained.fetch_add(1, Ordering::Relaxed);
            return Some(vec![3, 4, 5, 6].into_boxed_slice());
        });
        let normalized = normalize_woff_font(
            &bytes,
            BackendLimits {
                max_cmap_groups: 1,
                max_cmap_operations: 1,
                max_woff_decoded_bytes: 52,
                max_woff_tables: 2,
            },
            &decompress,
        )
        .expect("bounded WOFF normalization");
        assert_eq!(normalized.len(), 52);
        assert_eq!(calls.load(Ordering::Relaxed), 1);
    }

    fn put_u16(bytes: &mut [u8], at: usize, value: u16) {
        bytes[at..at + 2].copy_from_slice(&value.to_be_bytes());
    }

    fn put_u32(bytes: &mut [u8], at: usize, value: u32) {
        bytes[at..at + 4].copy_from_slice(&value.to_be_bytes());
    }
}

struct BackendFace {
    bytes: Arc<[u8]>,
    face_index: u32,
    reverse_cmap: Box<[i32]>,
}

#[derive(Clone, Copy)]
pub(crate) struct BackendLimits {
    pub(crate) max_cmap_groups: usize,
    pub(crate) max_cmap_operations: usize,
    pub(crate) max_woff_decoded_bytes: usize,
    pub(crate) max_woff_tables: usize,
}

#[derive(Clone, Copy)]
struct WoffRecord {
    compressed_length: usize,
    offset: usize,
    original_length: usize,
    tag: u32,
}

struct WoffPlan {
    flavor: u32,
    records: Vec<WoffRecord>,
}

struct FlightPathBuilder<'a> {
    path: &'a mut Path,
}

fn create_byte_to_utf16_map(text: &str) -> Vec<i32> {
    let mut map = vec![0; text.len().saturating_add(1)];
    let mut utf16 = 0_i32;
    for (byte, character) in text.char_indices() {
        for value in &mut map[byte..byte + character.len_utf8()] {
            *value = utf16;
        }
        utf16 += i32::try_from(character.len_utf16()).unwrap_or_default();
    }
    if let Some(last) = map.last_mut() {
        *last = utf16;
    }
    return map;
}

pub(crate) fn create_face(
    provider: &ProviderRef,
    family: &str,
    bytes: &[u8],
    face_index: u32,
    limits: BackendLimits,
) -> Result<Arc<FontFace>, BackendFailure> {
    let bytes = normalize_font_bytes(bytes, limits)?;
    let parsed = validate_bytes(&bytes, face_index)?;
    let reverse_cmap = build_reverse_cmap(&parsed, limits)?;
    let backend = Arc::new(BackendFace {
        bytes: Arc::from(bytes),
        face_index,
        reverse_cmap,
    });
    return Ok(Arc::new(FontFace {
        handle: FontFaceHandle {
            provider: provider.clone(),
            handle: backend,
        },
        family: family.to_string(),
    }));
}

fn create_features(text: &str, features: &[TextFeature]) -> Result<Vec<Feature>, BackendFailure> {
    let mut result = Vec::with_capacity(features.len());
    for feature in features {
        if feature.tag.len() != 4 || feature.value < 0 {
            return Err(BackendFailure::InvalidFeature);
        }
        let start = utf16_to_byte(text, feature.start.unwrap_or(0))?;
        let end = match feature.end {
            Some(end) => u32::try_from(utf16_to_byte(text, end)?)
                .map_err(|_| BackendFailure::InvalidFeature)?,
            None => u32::MAX,
        };
        result.push(Feature {
            tag: Tag::from_bytes_lossy(feature.tag.as_bytes()),
            value: feature.value as u32,
            start: u32::try_from(start).map_err(|_| BackendFailure::InvalidFeature)?,
            end,
        });
    }
    return Ok(result);
}

fn create_outline_source(face: &Arc<FontFace>) -> Option<Arc<flight_font::GlyphOutlineSource>> {
    let backend = backend_face(face)?;
    let outline_backend = backend.clone();
    let advance_backend = backend.clone();
    let index_backend = backend.clone();
    let metrics_backend = backend;
    return Some(Arc::new(create_glyph_outline_source(
        Arc::new(move |path, glyph_index| {
            let Ok(parsed) = Face::parse(&outline_backend.bytes, outline_backend.face_index) else {
                return false;
            };
            let Ok(glyph_index) = u16::try_from(glyph_index) else {
                return false;
            };
            path.commands.clear();
            path.data.clear();
            let mut builder = FlightPathBuilder { path };
            let glyph = GlyphId(glyph_index);
            return parsed.outline_glyph(glyph, &mut builder).is_some()
                || glyph_index < parsed.number_of_glyphs();
        }),
        Arc::new(move |glyph_index| {
            let Ok(parsed) = Face::parse(&advance_backend.bytes, advance_backend.face_index) else {
                return 0.0;
            };
            let Ok(glyph_index) = u16::try_from(glyph_index) else {
                return 0.0;
            };
            return parsed
                .glyph_hor_advance(GlyphId(glyph_index))
                .map_or(0.0, f32::from);
        }),
        Arc::new(move |code_point| {
            let Some(character) = char::from_u32(code_point) else {
                return -1;
            };
            return Face::parse(&index_backend.bytes, index_backend.face_index)
                .ok()
                .and_then(|parsed| parsed.glyph_index(character))
                .map_or(-1, |glyph| i32::from(glyph.0));
        }),
        Arc::new(move || {
            let Ok(parsed) = Face::parse(&metrics_backend.bytes, metrics_backend.face_index) else {
                return Arc::new(GlyphOutlineMetrics::default());
            };
            return Arc::new(GlyphOutlineMetrics {
                ascent: f32::from(parsed.ascender()),
                descent: f32::from(-parsed.descender()),
                line_gap: f32::from(parsed.line_gap()),
                units_per_em: f32::from(parsed.units_per_em()),
            });
        }),
    )));
}

fn apply_grouped_cmaps(
    cmap: &[u8],
    reverse: &mut [i32],
    limits: BackendLimits,
) -> Result<usize, BackendFailure> {
    let table_count = usize::from(read_u16(cmap, 2).ok_or(BackendFailure::MalformedFont)?);
    if table_count > limits.max_cmap_groups {
        return Err(BackendFailure::ResourceLimitExceeded);
    }
    let directory_end = 4_usize
        .checked_add(
            table_count
                .checked_mul(8)
                .ok_or(BackendFailure::MalformedFont)?,
        )
        .ok_or(BackendFailure::MalformedFont)?;
    if directory_end > cmap.len() {
        return Err(BackendFailure::MalformedFont);
    }
    let mut seen_offsets = HashSet::new();
    let mut groups_seen = 0_usize;
    let mut operations = 0_usize;
    for index in 0..table_count {
        let record = 4 + index * 8;
        let platform = read_u16(cmap, record).ok_or(BackendFailure::MalformedFont)?;
        let encoding = read_u16(cmap, record + 2).ok_or(BackendFailure::MalformedFont)?;
        let offset =
            usize::try_from(read_u32(cmap, record + 4).ok_or(BackendFailure::MalformedFont)?)
                .map_err(|_| BackendFailure::MalformedFont)?;
        let format = read_u16(cmap, offset).ok_or(BackendFailure::MalformedFont)?;
        let unicode = platform == 0
            || (platform == 3 && (encoding == 1 || (encoding == 10 && matches!(format, 12 | 13))));
        if !unicode || !matches!(format, 12 | 13) || !seen_offsets.insert(offset) {
            continue;
        }
        let length =
            usize::try_from(read_u32(cmap, offset + 4).ok_or(BackendFailure::MalformedFont)?)
                .map_err(|_| BackendFailure::MalformedFont)?;
        let end = offset
            .checked_add(length)
            .filter(|end| *end <= cmap.len())
            .ok_or(BackendFailure::MalformedFont)?;
        if length < 16 {
            return Err(BackendFailure::MalformedFont);
        }
        let group_count =
            usize::try_from(read_u32(cmap, offset + 12).ok_or(BackendFailure::MalformedFont)?)
                .map_err(|_| BackendFailure::ResourceLimitExceeded)?;
        groups_seen = groups_seen
            .checked_add(group_count)
            .ok_or(BackendFailure::ResourceLimitExceeded)?;
        if groups_seen > limits.max_cmap_groups {
            return Err(BackendFailure::ResourceLimitExceeded);
        }
        let groups_end = offset
            .checked_add(16)
            .and_then(|value| value.checked_add(group_count.checked_mul(12)?))
            .filter(|groups_end| *groups_end <= end)
            .ok_or(BackendFailure::MalformedFont)?;
        let mut previous_end = None;
        for group_index in 0..group_count {
            let group = offset + 16 + group_index * 12;
            let start = read_u32(cmap, group).ok_or(BackendFailure::MalformedFont)?;
            let range_end = read_u32(cmap, group + 4).ok_or(BackendFailure::MalformedFont)?;
            let start_glyph = read_u32(cmap, group + 8).ok_or(BackendFailure::MalformedFont)?;
            if start > range_end
                || range_end > 0x10_ffff
                || previous_end.is_some_and(|previous| start <= previous)
            {
                return Err(BackendFailure::MalformedFont);
            }
            previous_end = Some(range_end);
            if format == 12 {
                let span = range_end
                    .checked_sub(start)
                    .ok_or(BackendFailure::MalformedFont)?;
                let end_glyph = start_glyph
                    .checked_add(span)
                    .ok_or(BackendFailure::MalformedFont)?;
                if end_glyph >= u32::try_from(reverse.len()).unwrap_or(u32::MAX) {
                    return Err(BackendFailure::MalformedFont);
                }
                let work = usize::try_from(span)
                    .ok()
                    .and_then(|span| span.checked_add(1))
                    .ok_or(BackendFailure::ResourceLimitExceeded)?;
                operations = operations
                    .checked_add(work)
                    .ok_or(BackendFailure::ResourceLimitExceeded)?;
                if operations > limits.max_cmap_operations {
                    return Err(BackendFailure::ResourceLimitExceeded);
                }
                for delta in 0..=span {
                    set_reverse_mapping(reverse, (start_glyph + delta) as u16, start + delta);
                }
            } else {
                if start_glyph >= u32::try_from(reverse.len()).unwrap_or(u32::MAX) {
                    return Err(BackendFailure::MalformedFont);
                }
                operations = operations
                    .checked_add(1)
                    .ok_or(BackendFailure::ResourceLimitExceeded)?;
                if operations > limits.max_cmap_operations {
                    return Err(BackendFailure::ResourceLimitExceeded);
                }
                if let Some(candidate) = first_scalar_in_range(start, range_end) {
                    set_reverse_mapping(reverse, start_glyph as u16, candidate);
                }
            }
        }
        let _ = groups_end;
    }
    return Ok(operations);
}

fn apply_ttf_variations(face: &mut Face<'_>, variations: &[FontVariation]) {
    for variation in variations {
        let _ = face.set_variation(
            Tag::from_bytes_lossy(variation.axis.as_bytes()),
            variation.value,
        );
    }
}

fn backend_face(face: &FontFace) -> Option<Arc<BackendFace>> {
    return face.handle.handle.clone().downcast::<BackendFace>().ok();
}

fn build_reverse_cmap(
    face: &Face<'_>,
    limits: BackendLimits,
) -> Result<Box<[i32]>, BackendFailure> {
    let mut reverse = vec![-1; usize::from(face.number_of_glyphs())];
    let Some(cmap_bytes) = face.raw_face().table(Tag::from_bytes(b"cmap")) else {
        return Ok(reverse.into_boxed_slice());
    };
    let mut operations = apply_grouped_cmaps(cmap_bytes, &mut reverse, limits)?;
    let Some(cmap) = face.tables().cmap else {
        return Ok(reverse.into_boxed_slice());
    };
    if usize::from(cmap.subtables.len()) > limits.max_cmap_groups {
        return Err(BackendFailure::ResourceLimitExceeded);
    }
    for subtable in cmap.subtables {
        if !subtable.is_unicode()
            || matches!(
                subtable.format,
                Format::SegmentedCoverage(_) | Format::ManyToOneRangeMappings(_)
            )
        {
            continue;
        }
        let declared_work = match subtable.format {
            Format::ByteEncodingTable(_) => 256,
            Format::HighByteMappingThroughTable(_) | Format::SegmentMappingToDeltaValues(_) => {
                65_536
            }
            Format::TrimmedTableMapping(table) => usize::from(table.glyphs.len()),
            Format::TrimmedArray(table) => usize::try_from(table.glyphs.len())
                .map_err(|_| BackendFailure::ResourceLimitExceeded)?,
            Format::MixedCoverage | Format::UnicodeVariationSequences(_) => 0,
            Format::SegmentedCoverage(_) | Format::ManyToOneRangeMappings(_) => 0,
        };
        if declared_work > limits.max_cmap_operations.saturating_sub(operations) {
            return Err(BackendFailure::ResourceLimitExceeded);
        }
        let mut actual_work = 0_usize;
        subtable.codepoints(|candidate| {
            actual_work = actual_work.saturating_add(1);
            if let Some(glyph) = subtable.glyph_index(candidate) {
                set_reverse_mapping(&mut reverse, glyph.0, candidate);
            }
        });
        operations = operations
            .checked_add(actual_work)
            .ok_or(BackendFailure::ResourceLimitExceeded)?;
        if operations > limits.max_cmap_operations {
            return Err(BackendFailure::ResourceLimitExceeded);
        }
    }
    return Ok(reverse.into_boxed_slice());
}

// flight-lint: allow(f64) raster bounds are canonically f64 in Flight Path
fn checked_ceil_i64(value: f64) -> Result<i64, RasterFailure> {
    let value = value.ceil();
    if !value.is_finite() || value < i64::MIN as f64 || value > i64::MAX as f64 {
        return Err(RasterFailure::ResourceLimitExceeded);
    }
    return Ok(value as i64);
}

// flight-lint: allow(f64) raster bounds are canonically f64 in Flight Path
fn checked_floor_i64(value: f64) -> Result<i64, RasterFailure> {
    let value = value.floor();
    if !value.is_finite() || value < i64::MIN as f64 || value > i64::MAX as f64 {
        return Err(RasterFailure::ResourceLimitExceeded);
    }
    return Ok(value as i64);
}

fn first_scalar_in_range(start: u32, end: u32) -> Option<u32> {
    if char::from_u32(start).is_some() {
        return Some(start);
    }
    if start <= 0xdfff && end >= 0xe000 {
        return Some(0xe000);
    }
    return None;
}

fn from_rustybuzz_direction(direction: Direction) -> TextDirection {
    return match direction {
        Direction::RightToLeft | Direction::BottomToTop => TextDirection::RightToLeft,
        Direction::TopToBottom => TextDirection::TopToBottom,
        Direction::Invalid | Direction::LeftToRight => TextDirection::LeftToRight,
    };
}

pub(crate) fn get_code_point_for_glyph(face: &FontFace, glyph_id: i32) -> i32 {
    let Some(backend) = backend_face(face) else {
        return -1;
    };
    return usize::try_from(glyph_id)
        .ok()
        .and_then(|glyph_id| backend.reverse_cmap.get(glyph_id))
        .copied()
        .unwrap_or(-1);
}

pub(crate) fn get_font_metrics(
    face: &FontFace,
    variations: &[FontVariation],
) -> Option<FontMetrics> {
    let backend = backend_face(face)?;
    let mut parsed = Face::parse(&backend.bytes, backend.face_index).ok()?;
    apply_ttf_variations(&mut parsed, variations);
    let underline = parsed.underline_metrics();
    return Some(FontMetrics {
        ascent: f32::from(parsed.ascender()),
        cap_height: f32::from(parsed.capital_height().unwrap_or(parsed.ascender())),
        descent: f32::from(-parsed.descender()),
        line_gap: f32::from(parsed.line_gap()),
        underline_position: f32::from(underline.map_or(0, |value| value.position)),
        underline_thickness: f32::from(underline.map_or(0, |value| value.thickness)),
        units_per_em: f32::from(parsed.units_per_em()),
        x_height: f32::from(parsed.x_height().unwrap_or(0)),
    });
}

pub(crate) fn get_font_variation_axes(face: &FontFace) -> Vec<FontVariationAxis> {
    let Some(backend) = backend_face(face) else {
        return Vec::new();
    };
    let Ok(parsed) = Face::parse(&backend.bytes, backend.face_index) else {
        return Vec::new();
    };
    return parsed
        .variation_axes()
        .into_iter()
        .map(|axis| FontVariationAxis {
            default_value: axis.def_value,
            max: axis.max_value,
            min: axis.min_value,
            name: axis.tag.to_string(),
            tag: axis.tag.to_string(),
        })
        .collect();
}

pub(crate) fn get_glyph_extents(
    face: &FontFace,
    glyph_id: i32,
    font_size: f32,
) -> Option<GlyphExtents> {
    let backend = backend_face(face)?;
    let parsed = Face::parse(&backend.bytes, backend.face_index).ok()?;
    let glyph_id = GlyphId(u16::try_from(glyph_id).ok()?);
    let bounds = parsed.glyph_bounding_box(glyph_id)?;
    let scale = font_size / f32::from(parsed.units_per_em());
    return Some(GlyphExtents {
        height: f32::from(bounds.y_max - bounds.y_min) * scale,
        width: f32::from(bounds.x_max - bounds.x_min) * scale,
        x_bearing: f32::from(bounds.x_min) * scale,
        y_bearing: -f32::from(bounds.y_max) * scale,
    });
}

pub(crate) fn get_glyph_index_for_code_point(face: &FontFace, code_point: i32) -> i32 {
    let Some(character) = u32::try_from(code_point).ok().and_then(char::from_u32) else {
        return -1;
    };
    let Some(backend) = backend_face(face) else {
        return -1;
    };
    return Face::parse(&backend.bytes, backend.face_index)
        .ok()
        .and_then(|parsed| parsed.glyph_index(character))
        .map_or(-1, |glyph| i32::from(glyph.0));
}

pub(crate) fn get_glyph_name(face: &FontFace, glyph_id: i32) -> String {
    let Some(backend) = backend_face(face) else {
        return String::new();
    };
    let Ok(glyph_id) = u16::try_from(glyph_id) else {
        return String::new();
    };
    return Face::parse(&backend.bytes, backend.face_index)
        .ok()
        .and_then(|parsed| parsed.glyph_name(GlyphId(glyph_id)).map(str::to_string))
        .unwrap_or_default();
}

fn inspect_collection(bytes: &[u8], face_index: u32) -> Result<(), BackendFailure> {
    if bytes.len() < 12 {
        return Err(BackendFailure::MalformedFont);
    }
    let count = usize::try_from(read_u32(bytes, 8).ok_or(BackendFailure::MalformedFont)?)
        .map_err(|_| BackendFailure::MalformedFont)?;
    let index = usize::try_from(face_index).map_err(|_| BackendFailure::FaceIndexOutOfRange)?;
    if index >= count {
        return Err(BackendFailure::FaceIndexOutOfRange);
    }
    let offsets_end = 12_usize
        .checked_add(count.checked_mul(4).ok_or(BackendFailure::MalformedFont)?)
        .filter(|end| *end <= bytes.len())
        .ok_or(BackendFailure::MalformedFont)?;
    let offset =
        usize::try_from(read_u32(bytes, 12 + index * 4).ok_or(BackendFailure::MalformedFont)?)
            .map_err(|_| BackendFailure::MalformedFont)?;
    let _ = offsets_end;
    return inspect_sfnt_directory(bytes, offset);
}

pub(crate) fn inspect_font_bytes(
    bytes: &[u8],
    face_index: u32,
    limits: BackendLimits,
) -> Result<(), BackendFailure> {
    let format = detect_font_format(FontFormatData::Uint8Array(FontFormatUint8Array { bytes }))
        .ok_or(BackendFailure::UnsupportedFont)?;
    return match format {
        "woff" => {
            if face_index != 0 {
                return Err(BackendFailure::FaceIndexOutOfRange);
            }
            parse_woff_plan(bytes, limits).map(|_| ())
        }
        "collection" => inspect_collection(bytes, face_index),
        "opentype" | "truetype" => {
            if face_index != 0 {
                return Err(BackendFailure::FaceIndexOutOfRange);
            }
            inspect_sfnt_directory(bytes, 0)
        }
        _ => Err(BackendFailure::UnsupportedFont),
    };
}

fn inspect_sfnt_directory(bytes: &[u8], offset: usize) -> Result<(), BackendFailure> {
    let header_end = offset
        .checked_add(12)
        .filter(|end| *end <= bytes.len())
        .ok_or(BackendFailure::MalformedFont)?;
    let table_count =
        usize::from(read_u16(bytes, offset + 4).ok_or(BackendFailure::MalformedFont)?);
    let directory_end = header_end
        .checked_add(
            table_count
                .checked_mul(16)
                .ok_or(BackendFailure::MalformedFont)?,
        )
        .filter(|end| *end <= bytes.len())
        .ok_or(BackendFailure::MalformedFont)?;
    for index in 0..table_count {
        let record = offset + 12 + index * 16;
        let table_offset =
            usize::try_from(read_u32(bytes, record + 8).ok_or(BackendFailure::MalformedFont)?)
                .map_err(|_| BackendFailure::MalformedFont)?;
        let table_length =
            usize::try_from(read_u32(bytes, record + 12).ok_or(BackendFailure::MalformedFont)?)
                .map_err(|_| BackendFailure::MalformedFont)?;
        table_offset
            .checked_add(table_length)
            .filter(|end| *end <= bytes.len())
            .ok_or(BackendFailure::MalformedFont)?;
    }
    let _ = directory_end;
    return Ok(());
}

#[cfg(feature = "system-discovery")]
pub(crate) fn matches_family(
    bytes: &[u8],
    face_index: u32,
    family: &str,
    limits: BackendLimits,
) -> bool {
    let Ok(bytes) = normalize_font_bytes(bytes, limits) else {
        return false;
    };
    let Ok(parsed) = Face::parse(&bytes, face_index) else {
        return false;
    };
    return parsed.names().into_iter().any(|name| {
        (name.name_id == ttf_parser::name_id::FAMILY
            || name.name_id == ttf_parser::name_id::TYPOGRAPHIC_FAMILY)
            && name
                .to_string()
                .is_some_and(|value| value.eq_ignore_ascii_case(family))
    });
}

pub(crate) fn measure_metrics(
    face: &FontFace,
    options: &GlyphRasterizeOptions,
) -> Option<GlyphMetrics> {
    let metrics = get_font_metrics(face, &[])?;
    let scale = options.font_size / metrics.units_per_em;
    if !scale.is_finite() || scale <= 0.0 {
        return None;
    }
    return Some(GlyphMetrics {
        ascent: metrics.ascent * scale,
        descent: metrics.descent * scale,
        line_gap: metrics.line_gap * scale,
    });
}

fn normalize_font_bytes(bytes: &[u8], limits: BackendLimits) -> Result<Vec<u8>, BackendFailure> {
    let format = detect_font_format(FontFormatData::Uint8Array(FontFormatUint8Array { bytes }))
        .ok_or(BackendFailure::UnsupportedFont)?;
    return match format {
        "collection" | "opentype" | "truetype" => Ok(bytes.to_vec()),
        "woff" => normalize_woff_font(bytes, limits, &SDK_HOST_DECOMPRESS_DEFLATE.decompress),
        _ => Err(BackendFailure::UnsupportedFont),
    };
}

fn normalize_woff_font(
    bytes: &[u8],
    limits: BackendLimits,
    decompress: &Decompressor,
) -> Result<Vec<u8>, BackendFailure> {
    let plan = parse_woff_plan(bytes, limits)?;
    let mut streams: HashMap<(usize, usize, usize), Arc<[u8]>> = HashMap::new();
    let mut tables = Vec::with_capacity(plan.records.len());
    for record in plan.records {
        let key = (
            record.offset,
            record.compressed_length,
            record.original_length,
        );
        let data = if let Some(data) = streams.get(&key) {
            data.clone()
        } else {
            let stored = bytes
                .get(record.offset..record.offset + record.compressed_length)
                .ok_or(BackendFailure::MalformedFont)?;
            let data: Arc<[u8]> = if record.compressed_length == record.original_length {
                Arc::from(stored)
            } else {
                let inflated =
                    decompress(stored, record.original_length, CompressionFraming::Rfc1950)
                        .ok_or(BackendFailure::MalformedFont)?;
                if inflated.len() != record.original_length {
                    return Err(BackendFailure::MalformedFont);
                }
                Arc::from(inflated)
            };
            streams.insert(key, data.clone());
            data
        };
        tables.push(SfntFontTable {
            data: data.as_ref().to_vec().into_boxed_slice(),
            tag: record.tag,
        });
    }
    let normalized = assemble_sfnt_font(plan.flavor, &tables).into_vec();
    if normalized.len() > limits.max_woff_decoded_bytes {
        return Err(BackendFailure::ResourceLimitExceeded);
    }
    return Ok(normalized);
}

fn parse_woff_plan(bytes: &[u8], limits: BackendLimits) -> Result<WoffPlan, BackendFailure> {
    if bytes.len() < 44 || bytes.get(..4) != Some(b"wOFF") {
        return Err(BackendFailure::MalformedFont);
    }
    let declared_length = usize::try_from(read_u32(bytes, 8).ok_or(BackendFailure::MalformedFont)?)
        .map_err(|_| BackendFailure::MalformedFont)?;
    if declared_length != bytes.len() || read_u16(bytes, 14) != Some(0) {
        return Err(BackendFailure::MalformedFont);
    }
    let table_count = usize::from(read_u16(bytes, 12).ok_or(BackendFailure::MalformedFont)?);
    if table_count == 0 {
        return Err(BackendFailure::MalformedFont);
    }
    if table_count > limits.max_woff_tables {
        return Err(BackendFailure::ResourceLimitExceeded);
    }
    let directory_end = 44_usize
        .checked_add(
            table_count
                .checked_mul(20)
                .ok_or(BackendFailure::MalformedFont)?,
        )
        .filter(|end| *end <= bytes.len())
        .ok_or(BackendFailure::MalformedFont)?;
    let sfnt_header = 12_usize
        .checked_add(
            table_count
                .checked_mul(16)
                .ok_or(BackendFailure::MalformedFont)?,
        )
        .ok_or(BackendFailure::MalformedFont)?;
    let mut decoded_size = sfnt_header;
    let mut records = Vec::with_capacity(table_count);
    let mut tags = HashSet::with_capacity(table_count);
    let mut stream_lengths: HashMap<(usize, usize), usize> = HashMap::new();
    let mut unique_ranges = BTreeSet::new();
    for index in 0..table_count {
        let at = 44 + index * 20;
        let tag = read_u32(bytes, at).ok_or(BackendFailure::MalformedFont)?;
        let offset = usize::try_from(read_u32(bytes, at + 4).ok_or(BackendFailure::MalformedFont)?)
            .map_err(|_| BackendFailure::MalformedFont)?;
        let compressed_length =
            usize::try_from(read_u32(bytes, at + 8).ok_or(BackendFailure::MalformedFont)?)
                .map_err(|_| BackendFailure::MalformedFont)?;
        let original_length =
            usize::try_from(read_u32(bytes, at + 12).ok_or(BackendFailure::MalformedFont)?)
                .map_err(|_| BackendFailure::MalformedFont)?;
        let end = offset
            .checked_add(compressed_length)
            .filter(|end| offset >= directory_end && *end <= bytes.len())
            .ok_or(BackendFailure::MalformedFont)?;
        if !offset.is_multiple_of(4)
            || compressed_length > original_length
            || !tags.insert(tag)
            || original_length > limits.max_woff_decoded_bytes
        {
            return Err(if original_length > limits.max_woff_decoded_bytes {
                BackendFailure::ResourceLimitExceeded
            } else {
                BackendFailure::MalformedFont
            });
        }
        if stream_lengths
            .insert((offset, compressed_length), original_length)
            .is_some_and(|previous| previous != original_length)
        {
            return Err(BackendFailure::MalformedFont);
        }
        unique_ranges.insert((offset, end));
        let padded = original_length
            .checked_add(3)
            .map(|value| value & !3)
            .ok_or(BackendFailure::ResourceLimitExceeded)?;
        decoded_size = decoded_size
            .checked_add(padded)
            .ok_or(BackendFailure::ResourceLimitExceeded)?;
        if decoded_size > limits.max_woff_decoded_bytes {
            return Err(BackendFailure::ResourceLimitExceeded);
        }
        records.push(WoffRecord {
            compressed_length,
            offset,
            original_length,
            tag,
        });
    }
    let mut ranges: Vec<(usize, usize)> = unique_ranges.into_iter().collect();
    let meta_offset = usize::try_from(read_u32(bytes, 24).ok_or(BackendFailure::MalformedFont)?)
        .map_err(|_| BackendFailure::MalformedFont)?;
    let meta_length = usize::try_from(read_u32(bytes, 28).ok_or(BackendFailure::MalformedFont)?)
        .map_err(|_| BackendFailure::MalformedFont)?;
    let meta_original_length =
        usize::try_from(read_u32(bytes, 32).ok_or(BackendFailure::MalformedFont)?)
            .map_err(|_| BackendFailure::MalformedFont)?;
    if meta_offset == 0 {
        if meta_length != 0 || meta_original_length != 0 {
            return Err(BackendFailure::MalformedFont);
        }
    } else {
        if meta_length == 0 || meta_original_length == 0 {
            return Err(BackendFailure::MalformedFont);
        }
        ranges.push(woff_auxiliary_range(
            bytes,
            directory_end,
            meta_offset,
            meta_length,
        )?);
    }
    let private_offset = usize::try_from(read_u32(bytes, 36).ok_or(BackendFailure::MalformedFont)?)
        .map_err(|_| BackendFailure::MalformedFont)?;
    let private_length = usize::try_from(read_u32(bytes, 40).ok_or(BackendFailure::MalformedFont)?)
        .map_err(|_| BackendFailure::MalformedFont)?;
    if private_offset == 0 {
        if private_length != 0 {
            return Err(BackendFailure::MalformedFont);
        }
    } else {
        if private_length == 0 {
            return Err(BackendFailure::MalformedFont);
        }
        ranges.push(woff_auxiliary_range(
            bytes,
            directory_end,
            private_offset,
            private_length,
        )?);
    }
    ranges.sort_unstable();
    if ranges.windows(2).any(|pair| pair[1].0 < pair[0].1) {
        return Err(BackendFailure::MalformedFont);
    }
    let total_sfnt_size =
        usize::try_from(read_u32(bytes, 16).ok_or(BackendFailure::MalformedFont)?)
            .map_err(|_| BackendFailure::MalformedFont)?;
    if total_sfnt_size != decoded_size {
        return Err(BackendFailure::MalformedFont);
    }
    return Ok(WoffPlan {
        flavor: read_u32(bytes, 4).ok_or(BackendFailure::MalformedFont)?,
        records,
    });
}

// flight-lint: allow(f64) raster bounds are Flight Path f64 values widened from font coordinates
pub(crate) fn rasterize(
    face: &Arc<FontFace>,
    code_point: u32,
    options: &GlyphRasterizeOptions,
    max_glyph_pixels: usize,
) -> Result<GlyphRasterizedBitmap, RasterFailure> {
    let backend = backend_face(face).ok_or(RasterFailure::GlyphNotFound)?;
    let parsed = Face::parse(&backend.bytes, backend.face_index)
        .map_err(|_| RasterFailure::GlyphNotFound)?;
    let character = char::from_u32(code_point).ok_or(RasterFailure::GlyphNotFound)?;
    let glyph = parsed
        .glyph_index(character)
        .ok_or(RasterFailure::GlyphNotFound)?;
    let source = create_outline_source(face).ok_or(RasterFailure::GlyphNotFound)?;
    let mut path = create_path(Some(PathWinding::NonZero));
    if !(source.get_glyph_outline)(&mut path, i32::from(glyph.0)) {
        return Err(RasterFailure::GlyphNotFound);
    }
    let scale = options.font_size / f32::from(parsed.units_per_em());
    let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
    if get_path_bounds(&path, &mut bounds) && bounds.width != 0.0 && bounds.height != 0.0 {
        let left = checked_floor_i64(bounds.x * f64::from(scale))?.checked_sub(1);
        let top = checked_floor_i64(bounds.y * f64::from(scale))?.checked_sub(1);
        let right = checked_ceil_i64((bounds.x + bounds.width) * f64::from(scale))?.checked_add(1);
        let bottom =
            checked_ceil_i64((bounds.y + bounds.height) * f64::from(scale))?.checked_add(1);
        let estimated_pixels = right
            .zip(left)
            .and_then(|(right, left)| right.checked_sub(left))
            .zip(
                bottom
                    .zip(top)
                    .and_then(|(bottom, top)| bottom.checked_sub(top)),
            )
            .and_then(|(width, height)| {
                usize::try_from(width)
                    .ok()?
                    .checked_mul(usize::try_from(height).ok()?)
            })
            .ok_or(RasterFailure::ResourceLimitExceeded)?;
        if estimated_pixels > max_glyph_pixels {
            return Err(RasterFailure::ResourceLimitExceeded);
        }
    }
    let capability = allocate_glyph_rasterizer_backend_from_glyph_outline_source(source);
    let bitmap = capability
        .rasterize(code_point, options)
        .ok_or(RasterFailure::GlyphNotFound)?;
    let pixels = usize::try_from(bitmap.width)
        .ok()
        .and_then(|width| usize::try_from(bitmap.height).ok()?.checked_mul(width))
        .ok_or(RasterFailure::ResourceLimitExceeded)?;
    if pixels > max_glyph_pixels {
        return Err(RasterFailure::ResourceLimitExceeded);
    }
    return Ok(bitmap);
}

fn read_u16(bytes: &[u8], at: usize) -> Option<u16> {
    return Some(u16::from_be_bytes(bytes.get(at..at + 2)?.try_into().ok()?));
}

fn read_u32(bytes: &[u8], at: usize) -> Option<u32> {
    return Some(u32::from_be_bytes(bytes.get(at..at + 4)?.try_into().ok()?));
}

fn resolve_variations<'a>(
    format: &'a TextFormat,
    options: &'a TextShaperOptions,
) -> Vec<FontVariation> {
    if let Some(variations) = &options.variations {
        return variations.clone();
    }
    return format
        .variations
        .as_deref()
        .map_or_else(Vec::new, |variations| variations.clone());
}

fn set_reverse_mapping(reverse: &mut [i32], glyph: u16, code_point: u32) {
    if glyph == 0 || char::from_u32(code_point).is_none() {
        return;
    }
    let Some(slot) = reverse.get_mut(usize::from(glyph)) else {
        return;
    };
    let Ok(candidate) = i32::try_from(code_point) else {
        return;
    };
    if *slot < 0 || candidate < *slot {
        *slot = candidate;
    }
}

pub(crate) fn shape(
    face: &Arc<FontFace>,
    text: &str,
    format: &TextFormat,
    options: &TextShaperOptions,
) -> Result<Ref<ShapedRun>, BackendFailure> {
    let backend = backend_face(face).ok_or(BackendFailure::MalformedFont)?;
    let mut shaping_face = ShapingFace::from_slice(&backend.bytes, backend.face_index)
        .ok_or(BackendFailure::MalformedFont)?;
    let variations = resolve_variations(format, options);
    let shaping_variations: Vec<Variation> = variations
        .iter()
        .map(|variation| Variation {
            tag: Tag::from_bytes_lossy(variation.axis.as_bytes()),
            value: variation.value,
        })
        .collect();
    shaping_face.set_variations(&shaping_variations);

    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);
    if let Some(direction) = options.direction {
        buffer.set_direction(to_rustybuzz_direction(direction));
    }
    if let Some(script) = &options.script {
        let script = Script::from_str(script).map_err(|_| BackendFailure::InvalidFeature)?;
        buffer.set_script(script);
    }
    if let Some(language) = &options.language {
        let language = Language::from_str(language).map_err(|_| BackendFailure::InvalidFeature)?;
        buffer.set_language(language);
    }
    buffer.guess_segment_properties();
    let features = create_features(text, options.features.as_deref().unwrap_or(&[]))?;
    let direction = from_rustybuzz_direction(buffer.direction());
    let script = buffer.script().tag().to_string();
    let shaped = rustybuzz::shape(&shaping_face, &features, buffer);
    let scale = format.size.unwrap_or(12.0) / shaping_face.units_per_em() as f32;
    let letter_spacing = format.letter_spacing.unwrap_or(0.0);
    let byte_to_utf16 = create_byte_to_utf16_map(text);
    let glyphs: Vec<ShapedGlyph> = shaped
        .glyph_infos()
        .iter()
        .zip(shaped.glyph_positions())
        .map(|(info, position)| {
            let vertical = direction == TextDirection::TopToBottom;
            return ShapedGlyph {
                cluster: byte_to_utf16
                    .get(info.cluster as usize)
                    .copied()
                    .unwrap_or_default(),
                glyph_id: info.glyph_id as i32,
                x_advance: position.x_advance as f32 * scale
                    + if vertical { 0.0 } else { letter_spacing },
                x_offset: position.x_offset as f32 * scale,
                y_advance: -position.y_advance as f32 * scale
                    + if vertical { letter_spacing } else { 0.0 },
                y_offset: -position.y_offset as f32 * scale,
            };
        })
        .collect();
    let advance_width = if direction == TextDirection::TopToBottom {
        glyphs.iter().map(|glyph| glyph.y_advance).sum()
    } else {
        glyphs.iter().map(|glyph| glyph.x_advance).sum()
    };
    let mut font_resource = create_font_resource();
    font_resource.family = face.family.clone();
    font_resource.face = Some(face.clone());
    let font = Arc::new(RwLock::new(font_resource));
    let run = create_shaped_run();
    {
        let mut run = run.write().unwrap();
        run.advance_width = advance_width;
        run.direction = direction;
        run.font = Some(font);
        run.glyph_count = glyphs.len();
        run.glyphs = glyphs;
        run.script = script;
    }
    return Ok(run);
}

fn to_rustybuzz_direction(direction: TextDirection) -> Direction {
    return match direction {
        TextDirection::LeftToRight => Direction::LeftToRight,
        TextDirection::RightToLeft => Direction::RightToLeft,
        TextDirection::TopToBottom => Direction::TopToBottom,
    };
}

fn utf16_to_byte(text: &str, offset: i32) -> Result<usize, BackendFailure> {
    if offset < 0 {
        return Err(BackendFailure::InvalidFeature);
    }
    let mut utf16 = 0_i32;
    for (byte, character) in text.char_indices() {
        if utf16 == offset {
            return Ok(byte);
        }
        utf16 += i32::try_from(character.len_utf16()).unwrap_or_default();
        if utf16 > offset {
            return Err(BackendFailure::InvalidFeature);
        }
    }
    if utf16 == offset {
        return Ok(text.len());
    }
    return Err(BackendFailure::InvalidFeature);
}

fn validate_bytes(bytes: &[u8], face_index: u32) -> Result<Face<'_>, BackendFailure> {
    match Face::parse(bytes, face_index) {
        Ok(face) => Ok(face),
        Err(ttf_parser::FaceParsingError::FaceIndexOutOfBounds) => {
            Err(BackendFailure::FaceIndexOutOfRange)
        }
        Err(_) => Err(BackendFailure::MalformedFont),
    }
}

pub(crate) fn validate_face(face: &FontFace) -> Result<(), BackendFailure> {
    let backend = backend_face(face).ok_or(BackendFailure::MalformedFont)?;
    return validate_bytes(&backend.bytes, backend.face_index).map(|_| ());
}

fn woff_auxiliary_range(
    bytes: &[u8],
    directory_end: usize,
    offset: usize,
    length: usize,
) -> Result<(usize, usize), BackendFailure> {
    let end = offset
        .checked_add(length)
        .filter(|end| offset >= directory_end && offset.is_multiple_of(4) && *end <= bytes.len())
        .ok_or(BackendFailure::MalformedFont)?;
    return Ok((offset, end));
}

impl OutlineBuilder for FlightPathBuilder<'_> {
    fn close(&mut self) {
        append_path_close(self.path);
    }

    // flight-lint: allow(f64) Flight Path coordinates are canonically f64; the font outline widens exactly once
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        append_path_cubic_curve_to(
            self.path,
            f64::from(x1),
            -f64::from(y1),
            f64::from(x2),
            -f64::from(y2),
            f64::from(x),
            -f64::from(y),
        );
    }

    // flight-lint: allow(f64) Flight Path coordinates are canonically f64; the font outline widens exactly once
    fn line_to(&mut self, x: f32, y: f32) {
        append_path_line_to(self.path, f64::from(x), -f64::from(y));
    }

    // flight-lint: allow(f64) Flight Path coordinates are canonically f64; the font outline widens exactly once
    fn move_to(&mut self, x: f32, y: f32) {
        append_path_move_to(self.path, f64::from(x), -f64::from(y));
    }

    // flight-lint: allow(f64) Flight Path coordinates are canonically f64; the font outline widens exactly once
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        append_path_quadratic_curve_to(
            self.path,
            f64::from(x1),
            -f64::from(y1),
            f64::from(x),
            -f64::from(y),
        );
    }
}
