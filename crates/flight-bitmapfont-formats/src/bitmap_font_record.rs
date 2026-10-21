use std::collections::HashMap;

use flight_bitmapfont::{
    BitmapFont, BitmapFontData, BitmapFontGlyphData, BitmapFontGuardStateRef,
    BitmapFontKerningData, create_bitmap_font,
};
use flight_entity::Ref;
use flight_font::GlyphMetrics;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_textureatlas::TextureAtlas;

use crate::types::*;

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the bitmap-font module guard slot
pub fn build_bitmap_font_from_record(
    guard_state: &BitmapFontGuardStateRef,
    record: &BitmapFontRecord,
    options: Option<&BitmapFontParseOptions>,
) -> Option<Ref<BitmapFont>> {
    let mut resolved: HashMap<i32, Ref<TextureAtlas>> = HashMap::new();
    let mut fallback: Option<Ref<TextureAtlas>> = None;
    let mut max_page_id = -1;
    if let Some(resolve_page) = options.and_then(|value| value.resolve_page.as_ref()) {
        for page in &record.pages {
            if let Some(atlas) = resolve_page(page.id, &page.file) {
                if fallback.is_none() {
                    fallback = Some(atlas.clone());
                }
                resolved.insert(page.id, atlas);
                max_page_id = max_page_id.max(page.id);
            }
        }
    }
    for character in &record.chars {
        if !resolved.contains_key(&character.page) {
            return None;
        }
        max_page_id = max_page_id.max(character.page);
    }

    let mut pages = Vec::new();
    let mut page_presence = Vec::new();
    if max_page_id >= 0 {
        let fallback = fallback?;
        for id in 0..=max_page_id {
            if let Some(atlas) = resolved.get(&id) {
                pages.push(atlas.clone());
                page_presence.push(true);
            } else {
                pages.push(fallback.clone());
                page_presence.push(false);
            }
        }
    }
    let glyphs = record
        .chars
        .iter()
        .map(|character| BitmapFontGlyphData {
            advance: character.xadvance,
            bearing_x: character.xoffset,
            bearing_y: record.base as i32 - character.yoffset,
            codepoint: character.id,
            height: character.height,
            page: Some(character.page),
            width: character.width,
            x: character.x,
            y: character.y,
        })
        .collect();
    let kerning = record
        .kernings
        .iter()
        .map(|pair| BitmapFontKerningData {
            amount: pair.amount,
            left: pair.first,
            right: pair.second,
        })
        .collect();
    let font = create_bitmap_font(
        guard_state,
        &BitmapFontData {
            encoding: Some(record.encoding),
            glyphs,
            kerning: Some(kerning),
            metrics: GlyphMetrics {
                ascent: record.base,
                descent: record.line_height - record.base,
                line_gap: 0.0,
            },
            pages,
        },
    );
    font.write().unwrap().page_presence = page_presence;
    return Some(font);
}

fn report_bitmap_font_drop(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    origin: &str,
    kind: &str,
    records: usize,
) {
    let mut detail = HashMap::new();
    detail.insert(
        "records".to_string(),
        ImportDiagnosticDetailValue::Number(records as f32),
    );
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        kind,
        origin,
        Some(detail),
    );
}

pub fn report_dropped_bitmap_font_records(
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    origin: &str,
    pages: usize,
    chars: usize,
    kernings: usize,
) {
    if pages > 0 {
        report_bitmap_font_drop(
            diagnostics.as_deref_mut(),
            origin,
            "bmfont.page-unreadable",
            pages,
        );
    }
    if chars > 0 {
        report_bitmap_font_drop(
            diagnostics.as_deref_mut(),
            origin,
            "bmfont.char-unreadable",
            chars,
        );
    }
    if kernings > 0 {
        report_bitmap_font_drop(
            diagnostics.as_deref_mut(),
            origin,
            "bmfont.kerning-unreadable",
            kernings,
        );
    }
}
