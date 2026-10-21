use regex::Regex;
use serde_json::Value;

use crate::fnt_fields::{f32_to_i32, parse_fnt_fields, read_fnt_number};
use crate::json::{RawBitmapFontJson, RawChars};
use crate::types::*;

struct ProbeResult {
    char_count: usize,
    has_common: bool,
    kerning_count: usize,
    page_ids: Vec<i32>,
    referenced_pages: Vec<i32>,
}

pub fn explain_bitmap_font_parse(
    text: &str,
    options: Option<&BitmapFontParseOptions>,
) -> BitmapFontParseExplanation {
    if let Some(probe) = probe_json(text) {
        return build_explanation(BitmapFontParseExplanationFormat::Json, &probe, options);
    }
    if let Some(probe) = probe_xml(text) {
        return build_explanation(BitmapFontParseExplanationFormat::Xml, &probe, options);
    }
    if let Some(probe) = probe_fnt(text) {
        return build_explanation(BitmapFontParseExplanationFormat::Fnt, &probe, options);
    }
    return BitmapFontParseExplanation {
        char_count: 0,
        detected_format: BitmapFontParseExplanationFormat::Unknown,
        kerning_count: 0,
        page_count: 0,
        reason: BitmapFontParseExplanationReason::InvalidData,
        success: false,
        unresolved_pages: Vec::new(),
    };
}

fn build_explanation(
    detected_format: BitmapFontParseExplanationFormat,
    probe: &ProbeResult,
    options: Option<&BitmapFontParseOptions>,
) -> BitmapFontParseExplanation {
    let mut unresolved_pages = Vec::new();
    let reason = if !probe.has_common {
        BitmapFontParseExplanationReason::MissingCommon
    } else if probe.char_count == 0 {
        BitmapFontParseExplanationReason::MissingChars
    } else {
        for page_id in &probe.referenced_pages {
            if options
                .and_then(|value| value.resolve_page.as_ref())
                .and_then(|resolve_page| resolve_page(*page_id, ""))
                .is_none()
            {
                unresolved_pages.push(*page_id);
            }
        }
        if unresolved_pages.is_empty() {
            BitmapFontParseExplanationReason::Ok
        } else {
            BitmapFontParseExplanationReason::UnresolvedPage
        }
    };
    return BitmapFontParseExplanation {
        char_count: probe.char_count,
        detected_format,
        kerning_count: probe.kerning_count,
        page_count: probe.page_ids.len(),
        reason,
        success: reason == BitmapFontParseExplanationReason::Ok,
        unresolved_pages,
    };
}

fn probe_json(text: &str) -> Option<ProbeResult> {
    let root = serde_json::from_str::<RawBitmapFontJson>(text).ok()?;
    let has_common = root.common.as_ref().is_some_and(|common| {
        let Some(common) = common.as_object() else {
            return false;
        };
        return finite_json_number(common.get("lineHeight"))
            && finite_json_number(common.get("base"));
    });
    let mut char_count = 0;
    let mut referenced_pages = Vec::new();
    if let Some(RawChars::Values(chars)) = root.chars {
        for raw in chars {
            let Some(raw) = raw.as_object() else {
                continue;
            };
            if finite_json_number(raw.get("id")) {
                char_count += 1;
                let page = raw
                    .get("page")
                    .and_then(Value::as_f64)
                    .filter(|value| value.is_finite())
                    .unwrap_or(0.0) as i32;
                push_unique(&mut referenced_pages, page);
            }
        }
    }
    let page_ids = root
        .pages
        .as_ref()
        .and_then(Value::as_array)
        .map(|pages| (0..pages.len() as i32).collect())
        .unwrap_or_default();
    let mut kerning_count = 0;
    if let Some(kernings) = root.kernings.as_ref().and_then(Value::as_array) {
        for raw in kernings {
            let Some(raw) = raw.as_object() else {
                continue;
            };
            if raw.get("first").is_some_and(Value::is_number)
                && raw.get("second").is_some_and(Value::is_number)
                && raw.get("amount").is_some_and(Value::is_number)
            {
                kerning_count += 1;
            }
        }
    }
    return Some(ProbeResult {
        char_count,
        has_common,
        kerning_count,
        page_ids,
        referenced_pages,
    });
}

fn probe_fnt(text: &str) -> Option<ProbeResult> {
    let mut has_common = false;
    let mut char_count = 0;
    let mut kerning_count = 0;
    let mut page_ids = Vec::new();
    let mut referenced_pages = Vec::new();
    let mut has_any_tag = false;
    for raw_line in text.split(['\r', '\n']) {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let tag_end = line.find(char::is_whitespace).unwrap_or(line.len());
        let tag = &line[..tag_end];
        match tag {
            "common" => {
                has_any_tag = true;
                let fields = parse_fnt_fields(&line[tag_end..]);
                has_common = fields.contains_key("lineHeight") && fields.contains_key("base");
            }
            "page" => {
                has_any_tag = true;
                let fields = parse_fnt_fields(&line[tag_end..]);
                if let Some(id) = read_fnt_number(fields.get("id")) {
                    page_ids.push(f32_to_i32(id));
                }
            }
            "char" => {
                has_any_tag = true;
                let fields = parse_fnt_fields(&line[tag_end..]);
                if fields.contains_key("id") {
                    char_count += 1;
                    let page = read_fnt_number(fields.get("page"))
                        .map(f32_to_i32)
                        .unwrap_or(0);
                    push_unique(&mut referenced_pages, page);
                }
            }
            "kerning" => {
                has_any_tag = true;
                kerning_count += 1;
            }
            "info" | "chars" | "kernings" => has_any_tag = true,
            _ => {}
        }
    }
    if !has_any_tag {
        return None;
    }
    return Some(ProbeResult {
        char_count,
        has_common,
        kerning_count,
        page_ids,
        referenced_pages,
    });
}

fn probe_xml(text: &str) -> Option<ProbeResult> {
    let trimmed = text.trim_start();
    if !trimmed.starts_with('<') || (!trimmed.contains("<font") && !trimmed.contains("<Font")) {
        return None;
    }
    let common_line_height =
        Regex::new(r#"(?i)<common\s[^>]*?lineHeight\s*=\s*"(\d+)"[^>]*?base\s*=\s*"(\d+)""#)
            .unwrap();
    let common_base =
        Regex::new(r#"(?i)<common\s[^>]*?base\s*=\s*"(\d+)"[^>]*?lineHeight\s*=\s*"(\d+)""#)
            .unwrap();
    let has_common = common_line_height.is_match(text) || common_base.is_match(text);
    let page_regex = Regex::new(r#"(?i)<page\s[^>]*?id\s*=\s*"(\d+)""#).unwrap();
    let mut page_ids = Vec::new();
    for captures in page_regex.captures_iter(text) {
        page_ids.push(captures[1].parse::<i32>().unwrap_or(0));
    }
    let char_regex = Regex::new(r#"(?i)<char\s[^>]*?id\s*=\s*"(\d+)"[^>]*"#).unwrap();
    let char_page_regex = Regex::new(r#"\bpage\s*=\s*"(\d+)""#).unwrap();
    let mut char_count = 0;
    let mut referenced_pages = Vec::new();
    for found in char_regex.find_iter(text) {
        char_count += 1;
        let page = char_page_regex
            .captures(found.as_str())
            .and_then(|captures| captures[1].parse::<i32>().ok())
            .unwrap_or(0);
        push_unique(&mut referenced_pages, page);
    }
    let kerning_count = Regex::new(r"(?i)<kerning\s")
        .unwrap()
        .find_iter(text)
        .count();
    return Some(ProbeResult {
        char_count,
        has_common,
        kerning_count,
        page_ids,
        referenced_pages,
    });
}

fn finite_json_number(value: Option<&Value>) -> bool {
    return value
        .and_then(Value::as_f64)
        .is_some_and(|number| number.is_finite());
}

fn push_unique(values: &mut Vec<i32>, value: i32) {
    if !values.contains(&value) {
        values.push(value);
    }
}
