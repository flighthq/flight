use flight_bitmapfont::{BitmapFont, BitmapFontEncoding, BitmapFontGuardStateRef};
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;
use serde_json::Value;

use crate::bitmap_font_record::{
    build_bitmap_font_from_record, report_dropped_bitmap_font_records,
};
use crate::json::{RawBitmapFontJson, RawChars};
use crate::types::*;

pub(crate) fn is_bitmap_font_json_object(text: &str) -> bool {
    let Ok(root) = serde_json::from_str::<Value>(text) else {
        return false;
    };
    let Some(root) = root.as_object() else {
        return false;
    };
    return root
        .get("chars")
        .is_some_and(|chars| chars.is_array() || chars.as_object().is_some())
        && root
            .get("common")
            .is_some_and(|common| common.as_object().is_some());
}

// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the bitmap-font module guard slot
pub fn parse_bitmap_font_json(
    guard_state: &BitmapFontGuardStateRef,
    text: &str,
    options: Option<&BitmapFontParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Ref<BitmapFont>> {
    let record = parse_bitmap_font_json_record(text, diagnostics)?;
    return build_bitmap_font_from_record(guard_state, &record, options);
}

fn parse_bitmap_font_json_record(
    text: &str,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<BitmapFontRecord> {
    let root = serde_json::from_str::<RawBitmapFontJson>(text).ok()?;
    let common = root.common?.as_object()?.clone();
    let line_height = read_json_number(common.get("lineHeight"))?;
    let base = read_json_number(common.get("base"))?;
    let RawChars::Values(raw_chars) = root.chars? else {
        return None;
    };
    let mut dropped_chars = 0;
    let mut dropped_kernings = 0;
    let mut chars = Vec::new();
    for raw in &raw_chars {
        match read_json_char(raw) {
            Some(character) => chars.push(character),
            None => dropped_chars += 1,
        }
    }
    if chars.is_empty() {
        return None;
    }
    let mut pages = Vec::new();
    if let Some(raw_pages) = root.pages.as_ref().and_then(Value::as_array) {
        for (id, file) in raw_pages.iter().enumerate() {
            pages.push(BitmapFontPageRecord {
                file: file.as_str().unwrap_or_default().to_string(),
                id: id as i32,
            });
        }
    }
    let mut kernings = Vec::new();
    if let Some(raw_kernings) = root.kernings.as_ref().and_then(Value::as_array) {
        for raw in raw_kernings {
            match read_json_kerning(raw) {
                Some(pair) => kernings.push(pair),
                None => dropped_kernings += 1,
            }
        }
    }
    report_dropped_bitmap_font_records(
        diagnostics,
        "parseBitmapFontJsonRecord",
        0,
        dropped_chars,
        dropped_kernings,
    );
    return Some(BitmapFontRecord {
        base,
        chars,
        encoding: read_json_encoding(root.distance_field.as_ref()),
        kernings,
        line_height,
        pages,
    });
}

fn read_json_char(raw: &Value) -> Option<BitmapFontCharRecord> {
    let raw = raw.as_object()?;
    return Some(BitmapFontCharRecord {
        height: read_json_number(raw.get("height"))? as u32,
        id: read_json_number(raw.get("id"))? as u32,
        page: read_json_number(raw.get("page")).unwrap_or(0.0) as i32,
        width: read_json_number(raw.get("width"))? as u32,
        x: read_json_number(raw.get("x"))? as u32,
        xadvance: read_json_number(raw.get("xadvance"))?,
        xoffset: read_json_number(raw.get("xoffset"))? as i32,
        y: read_json_number(raw.get("y"))? as u32,
        yoffset: read_json_number(raw.get("yoffset"))? as i32,
    });
}

fn read_json_encoding(distance_field: Option<&Value>) -> BitmapFontEncoding {
    return match distance_field
        .and_then(Value::as_object)
        .and_then(|value| value.get("fieldType"))
        .and_then(Value::as_str)
    {
        Some("msdf") => BitmapFontEncoding::Msdf,
        Some("sdf") => BitmapFontEncoding::Sdf,
        _ => BitmapFontEncoding::Raster,
    };
}

fn read_json_kerning(raw: &Value) -> Option<BitmapFontKerningRecord> {
    let raw = raw.as_object()?;
    return Some(BitmapFontKerningRecord {
        amount: read_json_number(raw.get("amount"))?,
        first: read_json_number(raw.get("first"))? as u32,
        second: read_json_number(raw.get("second"))? as u32,
    });
}

fn read_json_number(value: Option<&Value>) -> Option<f32> {
    let value = value?.as_f64()?;
    if !value.is_finite() {
        return None;
    }
    return Some(value as f32);
}
