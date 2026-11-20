use std::str::FromStr;
use std::sync::{Arc, RwLock};

use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_entity::Ref;
use flight_font::{
    FontFace, FontFormatData, FontFormatUint8Array, FontVariationAxis,
    GlyphMetrics, GlyphOutlineMetrics, GlyphRasterizeOptions, GlyphRasterizedBitmap,
    allocate_glyph_rasterizer_backend_from_glyph_outline_source, create_font_resource,
    create_glyph_outline_source, detect_font_format,
};
use flight_font_formats::read_woff_font;
use flight_host::{FontFaceHandle, ProviderRef};
use flight_path::{
    Path, append_path_close, append_path_cubic_curve_to, append_path_line_to,
    append_path_move_to, append_path_quadratic_curve_to,
};
use flight_textformat::{FontVariation, TextFormat};
use flight_textshaper::{
    FontMetrics, GlyphExtents, ShapedGlyph, ShapedRun, TextDirection, TextFeature,
    TextShaperOptions, create_shaped_run,
};
use rustybuzz::{Direction, Face as ShapingFace, Feature, Language, Script, UnicodeBuffer, Variation};
use ttf_parser::{Face, GlyphId, OutlineBuilder, Tag};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BackendFailure {
    FaceIndexOutOfRange,
    InvalidFeature,
    MalformedFont,
    UnsupportedFont,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RasterFailure {
    GlyphNotFound,
    ResourceLimitExceeded,
}

struct BackendFace {
    bytes: Arc<[u8]>,
    face_index: u32,
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
) -> Result<Arc<FontFace>, BackendFailure> {
    let bytes = normalize_font_bytes(bytes)?;
    validate_bytes(&bytes, face_index)?;
    let backend = Arc::new(BackendFace {
        bytes: Arc::from(bytes),
        face_index,
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
            return parsed
                .outline_glyph(GlyphId(glyph_index), &mut builder)
                .is_some();
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
    let Ok(parsed) = Face::parse(&backend.bytes, backend.face_index) else {
        return -1;
    };
    let Ok(glyph_id) = u16::try_from(glyph_id) else {
        return -1;
    };
    let mut code_point = None;
    if let Some(cmap) = parsed.tables().cmap {
        for subtable in cmap.subtables {
            if !subtable.is_unicode() || code_point.is_some() {
                continue;
            }
            subtable.codepoints(|candidate| {
                if code_point.is_none()
                    && subtable.glyph_index(candidate) == Some(GlyphId(glyph_id))
                {
                    code_point = Some(candidate);
                }
            });
        }
    }
    return code_point
        .and_then(|value| i32::try_from(value).ok())
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

#[cfg(feature = "system-discovery")]
pub(crate) fn matches_family(bytes: &[u8], face_index: u32, family: &str) -> bool {
    let Ok(bytes) = normalize_font_bytes(bytes) else {
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

fn normalize_font_bytes(bytes: &[u8]) -> Result<Vec<u8>, BackendFailure> {
    let format = detect_font_format(FontFormatData::Uint8Array(FontFormatUint8Array { bytes }))
        .ok_or(BackendFailure::UnsupportedFont)?;
    return match format {
        "collection" | "opentype" | "truetype" => Ok(bytes.to_vec()),
        "woff" => read_woff_font(bytes, &SDK_HOST_DECOMPRESS_DEFLATE.decompress, None)
            .map(|value| value.into_vec())
            .ok_or(BackendFailure::MalformedFont),
        _ => Err(BackendFailure::UnsupportedFont),
    };
}

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
    let bounds = parsed
        .glyph_bounding_box(glyph)
        .ok_or(RasterFailure::GlyphNotFound)?;
    let scale = options.font_size / f32::from(parsed.units_per_em());
    let width = (f32::from(bounds.x_max - bounds.x_min) * scale).ceil();
    let height = (f32::from(bounds.y_max - bounds.y_min) * scale).ceil();
    if !width.is_finite() || !height.is_finite() || width < 0.0 || height < 0.0 {
        return Err(RasterFailure::ResourceLimitExceeded);
    }
    let estimated_pixels = (width as usize)
        .checked_add(2)
        .and_then(|width| {
            (height as usize)
                .checked_add(2)
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or(RasterFailure::ResourceLimitExceeded)?;
    if estimated_pixels > max_glyph_pixels {
        return Err(RasterFailure::ResourceLimitExceeded);
    }
    let source = create_outline_source(face).ok_or(RasterFailure::GlyphNotFound)?;
    let capability = allocate_glyph_rasterizer_backend_from_glyph_outline_source(source);
    return capability
        .rasterize(code_point, options)
        .ok_or(RasterFailure::GlyphNotFound);
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
    let shaped = rustybuzz::shape(&shaping_face, &features, buffer);
    let scale = format.size.unwrap_or(12.0) / shaping_face.units_per_em() as f32;
    let letter_spacing = format.letter_spacing.unwrap_or(0.0);
    let byte_to_utf16 = create_byte_to_utf16_map(text);
    let glyphs: Vec<ShapedGlyph> = shaped
        .glyph_infos()
        .iter()
        .zip(shaped.glyph_positions())
        .map(|(info, position)| ShapedGlyph {
            cluster: byte_to_utf16
                .get(info.cluster as usize)
                .copied()
                .unwrap_or_default(),
            glyph_id: info.glyph_id as i32,
            x_advance: position.x_advance as f32 * scale + letter_spacing,
            x_offset: position.x_offset as f32 * scale,
            y_advance: position.y_advance as f32 * scale,
            y_offset: -position.y_offset as f32 * scale,
        })
        .collect();
    let advance_width = glyphs.iter().map(|glyph| glyph.x_advance).sum();
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
        run.script = options.script.clone().unwrap_or_default();
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

fn validate_bytes(bytes: &[u8], face_index: u32) -> Result<(), BackendFailure> {
    match Face::parse(bytes, face_index) {
        Ok(_) => Ok(()),
        Err(ttf_parser::FaceParsingError::FaceIndexOutOfBounds) => {
            Err(BackendFailure::FaceIndexOutOfRange)
        }
        Err(_) => Err(BackendFailure::MalformedFont),
    }
}

pub(crate) fn validate_face(face: &FontFace) -> Result<(), BackendFailure> {
    let backend = backend_face(face).ok_or(BackendFailure::MalformedFont)?;
    return validate_bytes(&backend.bytes, backend.face_index);
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
