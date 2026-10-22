use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use flight_font::create_glyph_outline_source;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};

use crate::{
    SwfReader, SwfTagHandler, SwfTagHandlerRef, SwfTagParseState,
    read_swf_font_glyph_outline_source,
};

pub static SWF_FONT_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, tag, state, _timeline, _diagnostics| {
            if tag == TAG_DEFINE_FONT_INFO || tag == TAG_DEFINE_FONT_INFO_2 {
                read_swf_font_info(body, state, tag == TAG_DEFINE_FONT_INFO_2);
                return true;
            }
            read_swf_font_definition(body, state, tag);
            return true;
        }),
        resolve: Some(Arc::new(|state, _timeline| {
            compose_swf_font_code_points(state);
        })),
        tags: vec![
            TAG_DEFINE_FONT,
            TAG_DEFINE_FONT_2,
            TAG_DEFINE_FONT_3,
            TAG_DEFINE_FONT_INFO,
            TAG_DEFINE_FONT_INFO_2,
        ],
    })
});

// flight-lint: allow(hashmap-iteration) each font id is composed independently, so map traversal order cannot affect results
fn compose_swf_font_code_points(state: &mut SwfTagParseState) {
    for (font_id, code_points) in state.font_code_points.clone() {
        let Some(source) = state.font_outline_sources.get(&font_id).cloned() else {
            continue;
        };
        let mut codepoint_to_glyph_index = HashMap::new();
        for (glyph_index, code_point) in code_points.into_iter().enumerate() {
            codepoint_to_glyph_index
                .entry(code_point)
                .or_insert(glyph_index as i32);
        }
        let outline = source.get_glyph_outline.clone();
        let advance = source.get_glyph_outline_advance.clone();
        let metrics = source.get_glyph_outline_metrics.clone();
        state.font_outline_sources.insert(
            font_id,
            Arc::new(create_glyph_outline_source(
                outline,
                advance,
                Arc::new(move |code_point| {
                    codepoint_to_glyph_index
                        .get(&code_point)
                        .copied()
                        .unwrap_or(-1)
                }),
                metrics,
            )),
        );
    }
}

fn decode_swf_font_name(bytes: &[u8]) -> String {
    return bytes
        .iter()
        .map(|byte| decode_windows_1252(*byte))
        .collect();
}

fn decode_windows_1252(byte: u8) -> char {
    match byte {
        0x80 => '\u{20ac}',
        0x82 => '\u{201a}',
        0x83 => '\u{0192}',
        0x84 => '\u{201e}',
        0x85 => '\u{2026}',
        0x86 => '\u{2020}',
        0x87 => '\u{2021}',
        0x88 => '\u{02c6}',
        0x89 => '\u{2030}',
        0x8a => '\u{0160}',
        0x8b => '\u{2039}',
        0x8c => '\u{0152}',
        0x8e => '\u{017d}',
        0x91 => '\u{2018}',
        0x92 => '\u{2019}',
        0x93 => '\u{201c}',
        0x94 => '\u{201d}',
        0x95 => '\u{2022}',
        0x96 => '\u{2013}',
        0x97 => '\u{2014}',
        0x98 => '\u{02dc}',
        0x99 => '\u{2122}',
        0x9a => '\u{0161}',
        0x9b => '\u{203a}',
        0x9c => '\u{0153}',
        0x9e => '\u{017e}',
        0x9f => '\u{0178}',
        _ => char::from(byte),
    }
}

fn read_swf_font_definition(body: &SwfReader, state: &mut SwfTagParseState, code: u32) {
    let version = if code == TAG_DEFINE_FONT {
        1
    } else if code == TAG_DEFINE_FONT_2 {
        2
    } else {
        3
    };
    let font_id = {
        let bytes = body.source.read().unwrap();
        let low = bytes.get(body.pos).copied().unwrap_or(0);
        let high = bytes.get(body.pos + 1).copied().unwrap_or(0);
        u32::from(low) + u32::from(high) * 0x100
    };
    let mut reader = SwfReader::new(body.source.clone(), body.pos, body.end);
    let source = match &state.diagnostics {
        Some(diagnostics) => read_swf_font_glyph_outline_source(
            &mut reader,
            version,
            Some(&mut diagnostics.write().unwrap()),
            Some(font_id),
        ),
        None => read_swf_font_glyph_outline_source(&mut reader, version, None, Some(font_id)),
    };
    let Some(source) = source else {
        report_swf_font_loss(state, "swf.font-glyph-table", font_id, version);
        return;
    };
    if font_id == 0 {
        return;
    }
    if state.font_outline_sources.contains_key(&font_id) {
        report_swf_font_loss(state, "swf.font-character-id-reused", font_id, version);
    }
    state.font_outline_sources.insert(font_id, source);
    let font_name = read_swf_font_name(body, version);
    if !font_name.is_empty() {
        state.font_names.insert(font_id, font_name);
    }
}

fn read_swf_font_info(body: &mut SwfReader, state: &mut SwfTagParseState, has_language: bool) {
    let font_id = u32::from(body.read_uint16());
    let name_length = body.read_uint8();
    for _ in 0..name_length {
        body.read_uint8();
    }
    let flags = body.read_uint8();
    if has_language {
        body.read_uint8();
    }
    if !body.valid || font_id == 0 {
        return;
    }
    let wide_codes = flags & FONT_INFO_FLAG_WIDE_CODES != 0;
    let mut code_points = Vec::new();
    while body.pos < body.end && body.valid {
        code_points.push(if wide_codes {
            u32::from(body.read_uint16())
        } else {
            u32::from(body.read_uint8())
        });
    }
    if body.valid {
        state.font_code_points.insert(font_id, code_points);
    }
}

fn read_swf_font_name(body: &SwfReader, version: u32) -> String {
    if version == 1 {
        return String::new();
    }
    let mut reader = SwfReader::new(body.source.clone(), body.pos.saturating_add(2), body.end);
    reader.read_uint8();
    reader.read_uint8();
    let length = usize::from(reader.read_uint8());
    if !reader.valid || length == 0 || reader.pos.saturating_add(length) > reader.end {
        return String::new();
    }
    let source = body.source.read().unwrap();
    return decode_swf_font_name(&source[reader.pos..reader.pos + length]);
}

fn report_swf_font_loss(state: &SwfTagParseState, kind: &str, font_id: u32, version: u32) {
    let Some(diagnostics) = &state.diagnostics else {
        return;
    };
    let mut detail = HashMap::new();
    detail.insert(
        String::from("capability"),
        ImportDiagnosticDetailValue::String(if version == 1 {
            String::from("swf.font.define-font")
        } else {
            format!("swf.font.define-font-{version}")
        }),
    );
    detail.insert(
        String::from("characterId"),
        ImportDiagnosticDetailValue::Number(font_id as f32),
    );
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        ImportDiagnosticSeverity::Drop,
        kind,
        "readSwfFontDefinition",
        Some(detail),
    );
}

const FONT_INFO_FLAG_WIDE_CODES: u8 = 0x01;
const TAG_DEFINE_FONT: u32 = 10;
const TAG_DEFINE_FONT_2: u32 = 48;
const TAG_DEFINE_FONT_3: u32 = 75;
const TAG_DEFINE_FONT_INFO: u32 = 13;
const TAG_DEFINE_FONT_INFO_2: u32 = 62;
