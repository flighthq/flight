use std::collections::HashMap;

use crate::bitmap_font_record::{
    build_bitmap_font_from_record, report_dropped_bitmap_font_records,
};
use crate::fnt_fields::{f32_to_i32, f32_to_u32, parse_fnt_fields, read_fnt_number};
use crate::types::*;
use flight_bitmapfont::{
    BitmapFont, BitmapFontEncoding, BitmapFontGuardStateRef, BitmapFontKerningPair,
    get_bitmap_font_metrics, unpack_bitmap_font_kerning_key,
};
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;

pub fn format_bitmap_font_fnt(font: &Ref<BitmapFont>) -> String {
    let metrics = get_bitmap_font_metrics(font);
    let line_height = metrics.ascent + metrics.descent + metrics.line_gap;
    let base = metrics.ascent;
    let font_guard = font.read().unwrap();
    let (scale_w, scale_h) = font_guard
        .pages
        .first()
        .and_then(Option::as_ref)
        .and_then(|page| page.read().unwrap().texture.clone())
        .and_then(|texture| texture.read().unwrap().source.clone())
        .map(|source| {
            let source = source.read().unwrap();
            let fields = source.texture_source_fields();
            (fields.width, fields.height)
        })
        .unwrap_or((0, 0));
    let page_count = font_guard.pages.len().max(1);
    let mut lines = Vec::new();
    lines.push(format!(
        "info face=\"\" size={line_height} bold=0 italic=0 charset=\"\" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0 outline=0"
    ));
    lines.push(format!(
        "common lineHeight={line_height} base={base} scaleW={scale_w} scaleH={scale_h} pages={page_count} packed=0 alphaChnl=1 redChnl=0 greenChnl=0 blueChnl=0"
    ));
    for id in 0..page_count {
        lines.push(format!("page id={id} file=\"\""));
    }
    lines.push(format!("chars count={}", font_guard.glyph_order.len()));
    for codepoint in &font_guard.glyph_order {
        let Some(glyph) = font_guard.glyphs.get(codepoint) else {
            continue;
        };
        let glyph = glyph.read().unwrap();
        lines.push(format!(
            "char id={codepoint} x={} y={} width={} height={} xoffset={} yoffset={} xadvance={} page={} chnl=15",
            glyph.x,
            glyph.y,
            glyph.width,
            glyph.height,
            glyph.bearing_x,
            base - glyph.bearing_y as f32,
            glyph.advance,
            glyph.page,
        ));
    }
    lines.push(format!("kernings count={}", font_guard.kerning_order.len()));
    let mut pair = BitmapFontKerningPair::default();
    for key in &font_guard.kerning_order {
        let Some(amount) = font_guard.kerning.get(key) else {
            continue;
        };
        unpack_bitmap_font_kerning_key(&mut pair, *key);
        lines.push(format!(
            "kerning first={} second={} amount={amount}",
            pair.left, pair.right
        ));
    }
    return lines.join("\n") + "\n";
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the bitmap-font module guard slot
pub fn parse_bitmap_font_fnt(
    guard_state: &BitmapFontGuardStateRef,
    text: &str,
    options: Option<&BitmapFontParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<BitmapFont>> {
    let record = parse_bitmap_font_fnt_record(text, diagnostics)?;
    return build_bitmap_font_from_record(guard_state, &record, options);
}

fn parse_bitmap_font_fnt_record(
    text: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<BitmapFontRecord> {
    let mut line_height = None;
    let mut base = None;
    let mut pages = Vec::new();
    let mut chars = Vec::new();
    let mut kernings = Vec::new();
    let mut dropped_pages = 0;
    let mut dropped_chars = 0;
    let mut dropped_kernings = 0;
    for raw_line in text.split(['\r', '\n']) {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let tag_end = line.find(char::is_whitespace).unwrap_or(line.len());
        let tag = &line[..tag_end];
        let fields = parse_fnt_fields(&line[tag_end..]);
        match tag {
            "common" => {
                line_height = read_fnt_number(fields.get("lineHeight"));
                base = read_fnt_number(fields.get("base"));
            }
            "page" => {
                if let Some(id) = read_fnt_number(fields.get("id")) {
                    pages.push(BitmapFontPageRecord {
                        file: fields.get("file").cloned().unwrap_or_default(),
                        id: f32_to_i32(id),
                    });
                } else {
                    dropped_pages += 1;
                }
            }
            "char" => match read_fnt_char(&fields) {
                Some(character) => chars.push(character),
                None => dropped_chars += 1,
            },
            "kerning" => match read_fnt_kerning(&fields) {
                Some(pair) => kernings.push(pair),
                None => dropped_kernings += 1,
            },
            _ => {}
        }
    }
    report_dropped_bitmap_font_records(
        diagnostics,
        "parseBitmapFontFntRecord",
        dropped_pages,
        dropped_chars,
        dropped_kernings,
    );
    if chars.is_empty() {
        return None;
    }
    return Some(BitmapFontRecord {
        base: base?,
        chars,
        encoding: BitmapFontEncoding::Raster,
        kernings,
        line_height: line_height?,
        pages,
    });
}

fn read_fnt_char(fields: &HashMap<String, String>) -> Option<BitmapFontCharRecord> {
    return Some(BitmapFontCharRecord {
        height: f32_to_u32(read_fnt_number(fields.get("height"))?),
        id: f32_to_u32(read_fnt_number(fields.get("id"))?),
        page: f32_to_i32(read_fnt_number(fields.get("page")).unwrap_or(0.0)),
        width: f32_to_u32(read_fnt_number(fields.get("width"))?),
        x: f32_to_u32(read_fnt_number(fields.get("x"))?),
        xadvance: read_fnt_number(fields.get("xadvance"))?,
        xoffset: f32_to_i32(read_fnt_number(fields.get("xoffset"))?),
        y: f32_to_u32(read_fnt_number(fields.get("y"))?),
        yoffset: f32_to_i32(read_fnt_number(fields.get("yoffset"))?),
    });
}

fn read_fnt_kerning(fields: &HashMap<String, String>) -> Option<BitmapFontKerningRecord> {
    return Some(BitmapFontKerningRecord {
        amount: read_fnt_number(fields.get("amount"))?,
        first: f32_to_u32(read_fnt_number(fields.get("first"))?),
        second: f32_to_u32(read_fnt_number(fields.get("second"))?),
    });
}
