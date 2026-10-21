//! BitmapText layout, retained page rebuilding and glyph-placement version refresh.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{Rectangle, create_rectangle};
use flight_glyphatlas::contract::GlyphMetrics;
use flight_glyphatlas::{GlyphEntry, GlyphSource};
use flight_node::Node;
use flight_texture::{CreateTexture2DOptions, create_texture_2d, set_texture_source};
use flight_textureatlas::{add_texture_atlas_region, create_texture_atlas};

use crate::bitmap_text::is_bitmap_text_glyph_layout_stale;
use crate::types::*;

const BITMAP_TEXT_LAYOUT_ATTEMPTS: usize = 3;
const BITMAP_TEXT_TRANSFORM_STRIDE: usize = 2;
const CARRIAGE_RETURN: u32 = 0x0d;

struct BitmapTextGlyph {
    codepoint: u32,
    entry: Ref<GlyphEntry>,
    pen_within_word: f32,
}

struct BitmapTextLayoutData {
    align: BitmapTextAlign,
    ellipsis: String,
    letter_spacing: f32,
    line_height: f32,
    max_lines: Option<usize>,
    text: String,
    wrap_width: Option<f32>,
}

struct BitmapTextLayoutResult {
    lines: Vec<BitmapTextLine>,
    truncated: bool,
}

struct BitmapTextLine {
    gaps: Vec<f32>,
    paragraph_end: bool,
    width: f32,
    words: Vec<BitmapTextWord>,
}

struct BitmapTextToken {
    gap: f32,
    word: BitmapTextWord,
}

struct BitmapTextWord {
    glyphs: Vec<BitmapTextGlyph>,
    width: f32,
}

fn append_bitmap_text_page_quad(page: &mut BitmapTextPage, id: u16, x: f32, y: f32) {
    let index = page.instance_count;
    let capacity = page
        .ids
        .len()
        .min(page.transforms.len() / BITMAP_TEXT_TRANSFORM_STRIDE);
    if index >= capacity {
        let next = (index + 1).max(capacity * 2).max(8);
        reserve_uint16_array(&mut page.ids, next);
        reserve_float32_array(&mut page.transforms, next * BITMAP_TEXT_TRANSFORM_STRIDE);
    }
    page.ids[index] = id;
    let offset = index * BITMAP_TEXT_TRANSFORM_STRIDE;
    page.transforms[offset] = x;
    page.transforms[offset + 1] = y;
    page.instance_count = index + 1;
}

fn append_ellipsis(
    glyph_source: &Ref<GlyphSource>,
    guard_state: &BitmapTextGuardState,
    data: &BitmapTextLayoutData,
    lines: &mut [BitmapTextLine],
) {
    let Some(last_line) = lines.last_mut() else {
        return;
    };
    let ellipsis_tokens = build_bitmap_text_words(
        glyph_source,
        guard_state,
        &data.ellipsis,
        data.letter_spacing,
    );
    let mut ellipsis_width = 0.0;
    let mut ellipsis_glyphs = Vec::new();
    for token in ellipsis_tokens {
        ellipsis_width += token.gap + token.word.width;
        ellipsis_glyphs.extend(token.word.glyphs);
    }

    if let Some(wrap_width) = data.wrap_width {
        while !last_line.words.is_empty() && last_line.width + ellipsis_width > wrap_width {
            last_line.words.pop();
            if let Some(gap) = last_line.gaps.pop() {
                last_line.width -= gap;
            }
            last_line.width = 0.0;
            for index in 0..last_line.words.len() {
                last_line.width += last_line.words[index].width;
                if index < last_line.gaps.len() {
                    last_line.width += last_line.gaps[index];
                }
            }
        }
    }

    if ellipsis_glyphs.is_empty() {
        return;
    }
    let pen = last_line.width;
    for glyph in &mut ellipsis_glyphs {
        glyph.pen_within_word += pen;
    }
    last_line.words.push(BitmapTextWord {
        glyphs: ellipsis_glyphs,
        width: ellipsis_width,
    });
    last_line.width += ellipsis_width;
}

fn build_bitmap_text_words(
    glyph_source: &Ref<GlyphSource>,
    guard_state: &BitmapTextGuardState,
    paragraph: &str,
    letter_spacing: f32,
) -> Vec<BitmapTextToken> {
    let mut tokens = Vec::new();
    let mut pending_gap = 0.0;
    let mut glyphs = Vec::new();
    let mut pen = 0.0;
    let mut previous_codepoint = None;
    let mut in_word = false;

    for character in paragraph.chars() {
        let codepoint = character as u32;
        if codepoint == CARRIAGE_RETURN {
            continue;
        }
        if is_whitespace(codepoint) {
            if in_word {
                tokens.push(BitmapTextToken {
                    gap: pending_gap,
                    word: BitmapTextWord { glyphs, width: pen },
                });
                pending_gap = 0.0;
                glyphs = Vec::new();
                pen = 0.0;
                previous_codepoint = None;
                in_word = false;
            }
            let advance = call_glyph_source_get_entry(glyph_source, codepoint)
                .map(|entry| entry.read().unwrap().advance)
                .unwrap_or(0.0);
            pending_gap += advance + letter_spacing;
            continue;
        }
        let Some(entry) = call_glyph_source_get_entry(glyph_source, codepoint) else {
            if let Some(guard) = guard_state.missing_glyph_guard.clone() {
                guard(codepoint);
            }
            continue;
        };
        if let Some(previous_codepoint) = previous_codepoint {
            pen += call_glyph_source_get_kerning(glyph_source, previous_codepoint, codepoint);
        }
        let (advance, visible) = {
            let entry_guard = entry.read().unwrap();
            (
                entry_guard.advance,
                entry_guard.width > 0 && entry_guard.height > 0,
            )
        };
        if visible {
            glyphs.push(BitmapTextGlyph {
                codepoint,
                entry,
                pen_within_word: pen,
            });
        }
        pen += advance + letter_spacing;
        previous_codepoint = Some(codepoint);
        in_word = true;
    }
    if in_word {
        tokens.push(BitmapTextToken {
            gap: pending_gap,
            word: BitmapTextWord { glyphs, width: pen },
        });
    }
    return tokens;
}

pub(crate) fn call_glyph_source_get_atlas_image(
    source: &Ref<GlyphSource>,
    page: Option<u32>,
) -> Option<flight_texture::TextureSourceRef> {
    let callback = source.read().unwrap().get_glyph_atlas_image.clone();
    return callback(page);
}

pub(crate) fn call_glyph_source_get_entry(
    source: &Ref<GlyphSource>,
    codepoint: u32,
) -> Option<Ref<GlyphEntry>> {
    let callback = source.read().unwrap().get_glyph_entry.clone();
    return callback(codepoint);
}

fn call_glyph_source_get_kerning(source: &Ref<GlyphSource>, left: u32, right: u32) -> f32 {
    let callback = source.read().unwrap().get_glyph_kerning.clone();
    return callback(left, right);
}

pub(crate) fn call_glyph_source_get_layout_version(source: &Ref<GlyphSource>) -> u32 {
    let callback = source.read().unwrap().get_glyph_layout_version.clone();
    return callback();
}

fn call_glyph_source_get_metrics(source: &Ref<GlyphSource>) -> Arc<GlyphMetrics> {
    let callback = source.read().unwrap().get_glyph_metrics.clone();
    return callback();
}

fn ensure_bitmap_text_page(
    runtime: &mut BitmapTextRuntime,
    glyph_source: &Ref<GlyphSource>,
    region_maps: &mut HashMap<usize, HashMap<u32, u16>>,
    page: usize,
) -> bool {
    if region_maps.contains_key(&page) {
        return true;
    }
    let Some(image) = call_glyph_source_get_atlas_image(glyph_source, Some(page as u32)) else {
        return false;
    };
    while runtime.pages.len() <= page {
        runtime.pages.push(BitmapTextPage {
            atlas: create_texture_atlas(None),
            ids: Vec::new().into_boxed_slice(),
            instance_count: 0,
            transforms: Vec::new().into_boxed_slice(),
        });
    }
    let page_data = &mut runtime.pages[page];
    let texture = page_data.atlas.read().unwrap().texture.clone();
    match texture {
        Some(texture) => set_texture_source(&mut *texture.write().unwrap(), Some(image)),
        None => {
            let texture = Arc::new(RwLock::new(create_texture_2d(Some(
                &CreateTexture2DOptions {
                    source: Some(image),
                    ..CreateTexture2DOptions::default()
                },
            ))));
            page_data.atlas.write().unwrap().texture = Some(texture);
        }
    }
    region_maps.insert(page, HashMap::new());
    return true;
}

fn ensure_bounds_rectangle(runtime: &mut BitmapTextRuntime) -> &mut Rectangle {
    return runtime
        .local_bounds_rectangle
        .get_or_insert_with(|| create_rectangle(0.0, 0.0, 0.0, 0.0));
}

fn invalidate_bitmap_text_local_bounds(bitmap_text: &mut BitmapText) {
    let runtime = bitmap_text.node_runtime_mut();
    runtime.local_bounds_id = runtime.local_bounds_id.wrapping_add(1);
}

fn is_whitespace(codepoint: u32) -> bool {
    return matches!(
        codepoint,
        0x20 | 0x09 | 0x00a0 | 0x2002 | 0x2003 | 0x2009 | 0x3000
    );
}

fn layout_bitmap_text_lines(
    glyph_source: &Ref<GlyphSource>,
    guard_state: &BitmapTextGuardState,
    data: &BitmapTextLayoutData,
) -> BitmapTextLayoutResult {
    let mut lines = Vec::new();
    let paragraphs: Vec<&str> = data.text.split('\n').collect();
    let mut truncated = false;

    'paragraphs: for (paragraph_index, paragraph) in paragraphs.iter().enumerate() {
        let tokens =
            build_bitmap_text_words(glyph_source, guard_state, paragraph, data.letter_spacing);
        let mut current = BitmapTextLine {
            words: Vec::new(),
            gaps: Vec::new(),
            width: 0.0,
            paragraph_end: false,
        };
        for token in tokens {
            let wraps = data.wrap_width.is_some_and(|wrap_width| {
                !current.words.is_empty()
                    && current.width + token.gap + token.word.width > wrap_width
            });
            if wraps {
                if data
                    .max_lines
                    .is_some_and(|max_lines| lines.len() + 1 >= max_lines)
                {
                    truncated = true;
                    current.paragraph_end = false;
                    lines.push(current);
                    break 'paragraphs;
                }
                lines.push(current);
                current = BitmapTextLine {
                    width: token.word.width,
                    words: vec![token.word],
                    gaps: Vec::new(),
                    paragraph_end: false,
                };
            } else {
                if !current.words.is_empty() {
                    current.gaps.push(token.gap);
                    current.width += token.gap;
                }
                current.width += token.word.width;
                current.words.push(token.word);
            }
        }
        if data.max_lines.is_some_and(|max_lines| {
            lines.len() + 1 >= max_lines && paragraph_index < paragraphs.len() - 1
        }) {
            truncated = true;
            current.paragraph_end = true;
            lines.push(current);
            break;
        }
        current.paragraph_end = true;
        lines.push(current);
    }

    if truncated && !data.ellipsis.is_empty() && !lines.is_empty() {
        append_ellipsis(glyph_source, guard_state, data, &mut lines);
    }
    return BitmapTextLayoutResult { lines, truncated };
}

fn layout_bitmap_text_pages(bitmap_text: &mut BitmapText, guard_state: &BitmapTextGuardState) {
    let data = BitmapTextLayoutData {
        align: bitmap_text.data.align,
        ellipsis: bitmap_text.data.ellipsis.clone(),
        letter_spacing: bitmap_text.data.letter_spacing,
        line_height: bitmap_text.data.line_height,
        max_lines: bitmap_text.data.max_lines,
        text: bitmap_text.data.text.clone(),
        wrap_width: bitmap_text.data.wrap_width,
    };
    let glyph_source = bitmap_text.data.glyph_source.clone();
    let runtime = &mut bitmap_text.bitmap_text_runtime;

    let mut clear_page_index = 0;
    while clear_page_index < runtime.pages.len() {
        let page = &mut runtime.pages[clear_page_index];
        page.instance_count = 0;
        page.atlas.write().unwrap().regions.clear();
        clear_page_index += 1;
    }

    let Some(glyph_source) = glyph_source else {
        let bounds = ensure_bounds_rectangle(runtime);
        set_empty_rectangle(bounds);
        runtime.line_count = 0;
        runtime.truncated = false;
        invalidate_bitmap_text_local_bounds(bitmap_text);
        return;
    };
    if data.text.is_empty() {
        let bounds = ensure_bounds_rectangle(runtime);
        set_empty_rectangle(bounds);
        runtime.line_count = 0;
        runtime.truncated = false;
        invalidate_bitmap_text_local_bounds(bitmap_text);
        return;
    }

    let metrics = call_glyph_source_get_metrics(&glyph_source);
    let line_advance = (metrics.ascent + metrics.descent + metrics.line_gap) * data.line_height;
    let result = layout_bitmap_text_lines(&glyph_source, guard_state, &data);
    runtime.line_count = result.lines.len();
    runtime.truncated = result.truncated;
    let reference_width = data
        .wrap_width
        .unwrap_or_else(|| max_line_width(&result.lines));
    let mut region_maps: HashMap<usize, HashMap<u32, u16>> = HashMap::new();
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;

    for (line_index, line) in result.lines.iter().enumerate() {
        let baseline_y = metrics.ascent + line_index as f32 * line_advance;
        let mut start_x = 0.0;
        let mut gap_extra = 0.0;
        match data.align {
            BitmapTextAlign::Center => start_x = (reference_width - line.width) / 2.0,
            BitmapTextAlign::Right => start_x = reference_width - line.width,
            BitmapTextAlign::Justify
                if data.wrap_width.is_some() && !line.paragraph_end && !line.gaps.is_empty() =>
            {
                gap_extra = (data.wrap_width.unwrap_or(0.0) - line.width) / line.gaps.len() as f32;
            }
            BitmapTextAlign::Justify | BitmapTextAlign::Left => {}
        }

        let mut pen_x = start_x;
        for (word_index, word) in line.words.iter().enumerate() {
            if word_index > 0 {
                pen_x += line.gaps[word_index - 1] + gap_extra;
            }
            for glyph in &word.glyphs {
                let (bearing_x, bearing_y, height, page, width, x, y) = {
                    let entry = glyph.entry.read().unwrap();
                    (
                        entry.bearing_x,
                        entry.bearing_y,
                        entry.height,
                        entry.page as usize,
                        entry.width,
                        entry.x,
                        entry.y,
                    )
                };
                if !ensure_bitmap_text_page(runtime, &glyph_source, &mut region_maps, page) {
                    continue;
                }
                let quad_x = pen_x + glyph.pen_within_word + bearing_x as f32;
                let quad_y = baseline_y - bearing_y as f32;
                let region_id = region_maps
                    .get(&page)
                    .and_then(|regions| regions.get(&glyph.codepoint))
                    .copied();
                let region_id = match region_id {
                    Some(region_id) => region_id,
                    None => {
                        let page_data = &mut runtime.pages[page];
                        let region_id = {
                            let mut atlas = page_data.atlas.write().unwrap();
                            add_texture_atlas_region(
                                &mut atlas,
                                x as f32,
                                y as f32,
                                width as f32,
                                height as f32,
                                None,
                                None,
                                None,
                            );
                            (atlas.regions.len() - 1) as u16
                        };
                        region_maps
                            .get_mut(&page)
                            .expect("bitmap text page context")
                            .insert(glyph.codepoint, region_id);
                        region_id
                    }
                };
                append_bitmap_text_page_quad(&mut runtime.pages[page], region_id, quad_x, quad_y);
                min_x = min_x.min(quad_x);
                min_y = min_y.min(quad_y);
                max_x = max_x.max(quad_x + width as f32);
                max_y = max_y.max(quad_y + height as f32);
            }
            pen_x += word.width;
        }
    }

    let bounds = ensure_bounds_rectangle(runtime);
    if min_x == f32::INFINITY {
        set_empty_rectangle(bounds);
    } else {
        bounds.x = min_x;
        bounds.y = min_y;
        bounds.width = max_x - min_x;
        bounds.height = max_y - min_y;
    }
    invalidate_bitmap_text_local_bounds(bitmap_text);
}

fn max_line_width(lines: &[BitmapTextLine]) -> f32 {
    let mut max: f32 = 0.0;
    for line in lines {
        max = max.max(line.width);
    }
    return max;
}

/// Re-lays out only when the source's placement version differs (TS
/// `refreshBitmapTextGlyphLayout`).
// flight-lint: allow(conform-params) D5: caller-owned guard context replaces module guard slots
pub fn refresh_bitmap_text_glyph_layout(
    bitmap_text: &mut BitmapText,
    guard_state: &BitmapTextGuardState,
) -> bool {
    if !is_bitmap_text_glyph_layout_stale(bitmap_text) {
        return false;
    }
    update_bitmap_text(bitmap_text, guard_state);
    return true;
}

fn reserve_float32_array(target: &mut Box<[f32]>, capacity: usize) {
    if target.len() >= capacity {
        return;
    }
    let mut next = vec![0.0; capacity];
    next[..target.len()].copy_from_slice(target);
    *target = next.into_boxed_slice();
}

fn reserve_uint16_array(target: &mut Box<[u16]>, capacity: usize) {
    if target.len() >= capacity {
        return;
    }
    let mut next = vec![0; capacity];
    next[..target.len()].copy_from_slice(target);
    *target = next.into_boxed_slice();
}

/// Installs or clears the bounded-layout diagnostic callback (TS `setBitmapTextLayoutGuard`).
// flight-lint: allow(conform-params) D5: caller-owned guard context replaces the source module slot
pub fn set_bitmap_text_layout_guard(
    guard_state: &mut BitmapTextGuardState,
    guard: Option<BitmapTextLayoutGuard>,
) {
    guard_state.layout_guard = guard;
}

/// Installs or clears the missing-glyph callback (TS `setBitmapTextMissingGlyphGuard`).
// flight-lint: allow(conform-params) D5: caller-owned guard context replaces the source module slot
pub fn set_bitmap_text_missing_glyph_guard(
    guard_state: &mut BitmapTextGuardState,
    guard: Option<BitmapTextMissingGlyphGuard>,
) {
    guard_state.missing_glyph_guard = guard;
}

fn set_empty_rectangle(out: &mut Rectangle) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
}

/// Rebuilds page regions and quad buffers from current text and live glyph references (TS
/// `updateBitmapText`).
// flight-lint: allow(conform-params) D5: caller-owned guard context replaces module guard slots
pub fn update_bitmap_text(bitmap_text: &mut BitmapText, guard_state: &BitmapTextGuardState) {
    let Some(glyph_source) = bitmap_text.data.glyph_source.clone() else {
        layout_bitmap_text_pages(bitmap_text, guard_state);
        bitmap_text.bitmap_text_runtime.glyph_layout_version = -1;
        return;
    };
    for _attempt in 1..=BITMAP_TEXT_LAYOUT_ATTEMPTS {
        let version = call_glyph_source_get_layout_version(&glyph_source);
        layout_bitmap_text_pages(bitmap_text, guard_state);
        if call_glyph_source_get_layout_version(&glyph_source) == version {
            bitmap_text.bitmap_text_runtime.glyph_layout_version = i64::from(version);
            return;
        }
    }
    bitmap_text.bitmap_text_runtime.glyph_layout_version =
        i64::from(call_glyph_source_get_layout_version(&glyph_source));
    if let Some(guard) = guard_state.layout_guard.clone() {
        guard("layout-did-not-converge", BITMAP_TEXT_LAYOUT_ATTEMPTS);
    }
}
