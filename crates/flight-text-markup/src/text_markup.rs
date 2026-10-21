//! Parse and format the `htmlText` subset (TS `textMarkup.ts`).

use std::sync::{Arc, RwLock};

use flight_color::get_color_rgb;
use flight_entity::{Record, get_record_value};
use flight_textformat::{TextFormat, create_text_format_range};
use flight_textlayout::{RichTextContent, create_rich_text_content};

use crate::markup_tag_registry::{
    create_markup_tag_registry, merge_markup_format, register_standard_markup_tags,
};
use crate::text_markup_guards::report_text_markup_issue;
use crate::types::*;

struct MarkupFormatRun {
    start: usize,
    end: usize,
    format: TextFormat,
}

fn append_markup_break_before(content: &mut RichTextContent) {
    if content.text.is_empty() || content.text.ends_with('\n') {
        return;
    }
    append_markup_string(content, "\n", &TextFormat::default());
}

fn append_markup_string(content: &mut RichTextContent, value: &str, format: &TextFormat) {
    if value.is_empty() {
        return;
    }
    let start = utf16_len(&content.text);
    content.text.push_str(value);
    push_markup_range(content, format, start, utf16_len(&content.text));
}

fn append_markup_text(content: &mut RichTextContent, raw: &str, format: &TextFormat) {
    let decoded = decode_markup_entities(raw);
    append_markup_string(content, &decoded, format);
}

fn decode_markup_entities(value: &str) -> String {
    if !value.contains('&') {
        return String::from(value);
    }
    let mut out = String::with_capacity(value.len());
    let mut index = 0_usize;
    while index < value.len() {
        let rest = &value[index..];
        let Some(amp) = rest.find('&') else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..amp]);
        let after = &rest[amp + 1..];
        let Some(end) = after.find(';') else {
            out.push_str(&rest[amp..]);
            break;
        };
        let entity = &after[..end];
        let replaced = decode_markup_entity(entity);
        match replaced {
            Some(text) => out.push_str(&text),
            None => {
                out.push('&');
                out.push_str(entity);
                out.push(';');
            }
        }
        index += amp + 1 + end + 1;
    }
    return out;
}

fn decode_markup_entity(entity: &str) -> Option<String> {
    let lower = entity.to_lowercase();
    if let Some(hex) = lower.strip_prefix("#x") {
        if hex.is_empty() || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        let code = u32::from_str_radix(hex, 16).ok()?;
        return char::from_u32(code).map(String::from);
    }
    if let Some(decimal) = lower.strip_prefix('#') {
        if decimal.is_empty() || !decimal.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        let code = decimal.parse::<u32>().ok()?;
        return char::from_u32(code).map(String::from);
    }
    if !lower.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    return match lower.as_str() {
        "amp" => Some(String::from("&")),
        "apos" => Some(String::from("'")),
        "gt" => Some(String::from(">")),
        "lt" => Some(String::from("<")),
        "quot" => Some(String::from("\"")),
        _ => None,
    };
}

// D5: the source memoizes one module-global default registry; building it per parse keeps the parser
// free of hidden mutable state. The dialect and behavior are identical; no caller can observe the
// default registry's identity (a passed registry is used as-is).
fn default_markup_registry() -> MarkupTagRegistry {
    let mut registry = create_markup_tag_registry();
    register_standard_markup_tags(&mut registry);
    return registry;
}

fn escape_markup_attribute(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '"' => out.push_str("&quot;"),
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(character),
        }
    }
    return out;
}

fn escape_markup_text(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(character),
        }
    }
    return out;
}

/// Serializes rich text back into `htmlText` subset markup (TS `formatTextMarkup`). Colors always
/// emit as `#rrggbb`; fields with no source representation are omitted.
pub fn explain_text_markup(
    html: &str,
    registry: Option<&MarkupTagRegistry>,
) -> TextMarkupExplanation {
    let mut issues: Vec<TextMarkupIssue> = Vec::new();
    let mut collect = |issue: &TextMarkupIssue| {
        issues.push(TextMarkupIssue {
            kind: issue.kind,
            offset: issue.offset,
            tag: issue.tag.clone(),
            value: issue.value.clone(),
        });
    };
    parse_text_markup_with(html, registry, &mut collect);
    return TextMarkupExplanation { issues };
}

fn format_markup_anchor_tag(format: &TextFormat) -> String {
    let mut tag = String::from("<a");
    if let Some(url) = &format.url {
        tag.push_str(&format!(" href=\"{}\"", escape_markup_attribute(url)));
    }
    if let Some(target) = &format.target {
        tag.push_str(&format!(" target=\"{}\"", escape_markup_attribute(target)));
    }
    tag.push('>');
    return tag;
}

fn format_markup_color(color: u32) -> String {
    return format!("#{:06x}", get_color_rgb(color));
}

fn format_markup_font_tag(format: &TextFormat) -> Option<String> {
    let has_color = format.color.is_some();
    let has_size = format.size.is_some();
    let has_face = format.font.is_some();
    if !has_color && !has_size && !has_face {
        return None;
    }
    let mut tag = String::from("<font");
    if let Some(color) = format.color {
        tag.push_str(&format!(" color=\"{}\"", format_markup_color(color)));
    }
    if let Some(size) = format.size {
        tag.push_str(&format!(" size=\"{}\"", size));
    }
    if let Some(face) = &format.font {
        tag.push_str(&format!(" face=\"{}\"", escape_markup_attribute(face)));
    }
    tag.push('>');
    return Some(tag);
}

fn format_markup_list_tag(format: &TextFormat) -> String {
    if let Some(marker) = &format.list_marker {
        return format!(
            "<li type=\"{}\">",
            flight_textformat::contract::get_text_format_list_marker_string(*marker)
        );
    }
    return String::from("<li>");
}

fn format_markup_run(format: &TextFormat, text: &str) -> String {
    let mut open: Vec<String> = Vec::new();
    let mut close: Vec<String> = Vec::new();
    if let Some(tag) = format_markup_textformat_tag(format) {
        open.push(tag);
        close.insert(0, String::from("</textformat>"));
    }
    if let Some(align) = &format.align {
        open.push(format!(
            "<p align=\"{}\">",
            flight_textformat::contract::get_text_format_align_string(*align)
        ));
        close.insert(0, String::from("</p>"));
    }
    if format.bullet == Some(true) {
        open.push(format_markup_list_tag(format));
        close.insert(0, String::from("</li>"));
    }
    if format.url.is_some() || format.target.is_some() {
        open.push(format_markup_anchor_tag(format));
        close.insert(0, String::from("</a>"));
    }
    if let Some(tag) = format_markup_font_tag(format) {
        open.push(tag);
        close.insert(0, String::from("</font>"));
    }
    if format.bold == Some(true) {
        open.push(String::from("<b>"));
        close.insert(0, String::from("</b>"));
    }
    if format.italic == Some(true) {
        open.push(String::from("<i>"));
        close.insert(0, String::from("</i>"));
    }
    if format.underline == Some(true) {
        open.push(String::from("<u>"));
        close.insert(0, String::from("</u>"));
    }
    if format.strikethrough == Some(true) {
        open.push(String::from("<s>"));
        close.insert(0, String::from("</s>"));
    }
    let mut out = open.join("");
    out.push_str(&escape_markup_text(text));
    out.push_str(&close.join(""));
    return out;
}

fn format_markup_textformat_tag(format: &TextFormat) -> Option<String> {
    let mut tag = String::from("<textformat");
    let mut any = false;
    if let Some(value) = format.block_indent {
        tag.push_str(&format!(" blockindent=\"{}\"", value));
        any = true;
    }
    if let Some(value) = format.indent {
        tag.push_str(&format!(" indent=\"{}\"", value));
        any = true;
    }
    if let Some(value) = format.leading {
        tag.push_str(&format!(" leading=\"{}\"", value));
        any = true;
    }
    if let Some(value) = format.left_margin {
        tag.push_str(&format!(" leftmargin=\"{}\"", value));
        any = true;
    }
    if let Some(value) = format.right_margin {
        tag.push_str(&format!(" rightmargin=\"{}\"", value));
        any = true;
    }
    if let Some(stops) = &format.tab_stops {
        let joined: Vec<String> = stops.iter().map(|value| value.to_string()).collect();
        tag.push_str(&format!(" tabstops=\"{}\"", joined.join(",")));
        any = true;
    }
    if !any {
        return None;
    }
    tag.push('>');
    return Some(tag);
}

/// Serializes a `RichTextContent` back into `htmlText` subset markup (TS `formatTextMarkup`).
pub fn format_text_markup(content: &RichTextContent) -> String {
    if content.text.is_empty() {
        return String::new();
    }
    let runs = resolve_markup_format_runs(content);
    let mut output = String::new();
    for run in runs {
        let text = utf16_slice(&content.text, run.start, run.end);
        output.push_str(&format_markup_run(&run.format, text));
    }
    return output;
}

fn handle_markup_token(
    content: &mut RichTextContent,
    registry: &MarkupTagRegistry,
    token: &str,
    offset: usize,
    stack: &mut Vec<TextFormat>,
    report: &mut dyn FnMut(&TextMarkupIssue),
) {
    let inner = token[1..token.len() - 1].trim();
    if inner.is_empty() || inner.starts_with('!') || inner.starts_with('?') {
        return;
    }
    let closing = inner.starts_with('/');
    let self_closing = inner.ends_with('/');
    let mut body = if closing { &inner[1..] } else { inner };
    if let Some(stripped) = body.strip_suffix('/') {
        body = stripped;
    }
    let body = body.trim();
    let separator = body.char_indices().find(|(_, c)| c.is_whitespace());
    let (name, attributes_source) = match separator {
        Some((index, _)) => (body[..index].to_lowercase(), body[index + 1..].trim_start()),
        None => (body.to_lowercase(), ""),
    };

    if closing {
        if stack.len() > 1 {
            stack.pop();
        }
        return;
    }

    let top = stack.last().cloned().unwrap_or_default();
    let Some(handler) = crate::markup_tag_registry::get_markup_tag_handler(registry, &name) else {
        report(&TextMarkupIssue {
            kind: TextMarkupIssueKind::UnknownTag,
            offset,
            tag: name,
            value: None,
        });
        if !self_closing {
            stack.push(top);
        }
        return;
    };

    let mut attributes = parse_markup_attributes(attributes_source);
    if name == "a" {
        if let Some(href) = get_record_value(&attributes, "href").cloned() {
            if !is_safe_markup_href(&href) {
                report(&TextMarkupIssue {
                    kind: TextMarkupIssueKind::UnsafeHref,
                    offset,
                    tag: String::from("a"),
                    value: Some(href),
                });
                flight_entity::delete_record_value(&mut attributes, "href");
            }
        }
    }

    let result = handler(&attributes, &top);
    if name == "font" {
        if let Some(color) = get_record_value(&attributes, "color") {
            let resolved = match &result {
                MarkupTagResult::Format(format) => format.color.is_some(),
                MarkupTagResult::Effect(effect) => effect
                    .format
                    .as_ref()
                    .is_some_and(|format| format.color.is_some()),
            };
            if !resolved {
                report(&TextMarkupIssue {
                    kind: TextMarkupIssueKind::UnresolvedFontColor,
                    offset,
                    tag: String::from("font"),
                    value: Some(color.clone()),
                });
            }
        }
    }

    match result {
        MarkupTagResult::Effect(effect) => {
            if effect.format.is_none() && effect.text.is_some() {
                append_markup_string(content, effect.text.as_deref().unwrap_or(""), &top);
                return;
            }
            if effect.break_before == Some(true) {
                append_markup_break_before(content);
            }
            if let Some(text) = &effect.text {
                append_markup_string(content, text, &top);
            }
            let merged = merge_markup_format(
                &top,
                effect.format.as_ref().unwrap_or(&TextFormat::default()),
            );
            if !self_closing {
                stack.push(merged);
            }
        }
        MarkupTagResult::Format(format) => {
            let merged = merge_markup_format(&top, &format);
            if !self_closing {
                stack.push(merged);
            }
        }
    }
}

fn is_markup_format_empty(format: &TextFormat) -> bool {
    return *format == TextFormat::default();
}

fn is_safe_markup_href(value: &str) -> bool {
    let mut compact = String::new();
    for character in value.trim().chars() {
        if character as u32 > 0x20 {
            compact.push(character);
        }
    }
    let lowered = compact.to_lowercase();
    let Some(colon) = lowered.find(':') else {
        return true;
    };
    let scheme = &lowered[..colon];
    if scheme.is_empty()
        || !scheme
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
    {
        return true;
    }
    if !scheme
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-')
    {
        return true;
    }
    return scheme == "http" || scheme == "https" || scheme == "mailto" || scheme == "tel";
}

fn parse_markup_attributes(source: &str) -> Record<String> {
    let mut attributes: Record<String> = Record::default();
    let bytes = source.as_bytes();
    let mut index = 0_usize;
    while index < bytes.len() {
        while index < bytes.len() && (bytes[index] as char).is_whitespace() {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }
        let name_start = index;
        while index < bytes.len() && !(bytes[index] as char).is_whitespace() && bytes[index] != b'='
        {
            index += 1;
        }
        if index == name_start {
            index += 1;
            continue;
        }
        let name = source[name_start..index].to_lowercase();
        while index < bytes.len() && (bytes[index] as char).is_whitespace() {
            index += 1;
        }
        let mut raw = String::new();
        if index < bytes.len() && bytes[index] == b'=' {
            index += 1;
            while index < bytes.len() && (bytes[index] as char).is_whitespace() {
                index += 1;
            }
            if index < bytes.len() && (bytes[index] == b'"' || bytes[index] == b'\'') {
                let quote = bytes[index];
                index += 1;
                let value_start = index;
                while index < bytes.len() && bytes[index] != quote {
                    index += 1;
                }
                raw = String::from(&source[value_start..index]);
                if index < bytes.len() {
                    index += 1;
                }
            } else {
                let value_start = index;
                while index < bytes.len()
                    && !(bytes[index] as char).is_whitespace()
                    && bytes[index] != b'"'
                    && bytes[index] != b'\''
                    && bytes[index] != b'>'
                {
                    index += 1;
                }
                raw = String::from(&source[value_start..index]);
            }
        }
        let value = decode_markup_entities(&raw);
        flight_entity::set_record_value(&mut attributes, name, value);
    }
    return attributes;
}

// flight-lint: allow(conform-params) D5: the guard slot is caller-owned explicit state; TS reports through a module global
/// Parses `htmlText`-style markup into the rich-text model (TS `parseTextMarkup`). Malformed markup
/// recovers best-effort; issues go to the caller-owned guard state.
pub fn parse_text_markup(
    html: &str,
    registry: Option<&MarkupTagRegistry>,
    guard: &TextMarkupGuardState,
) -> RichTextContent {
    let mut report = |issue: &TextMarkupIssue| {
        report_text_markup_issue(guard, issue);
    };
    return parse_text_markup_with(html, registry, &mut report);
}

fn parse_text_markup_with(
    html: &str,
    registry: Option<&MarkupTagRegistry>,
    report: &mut dyn FnMut(&TextMarkupIssue),
) -> RichTextContent {
    let owned = default_markup_registry();
    let registry = registry.unwrap_or(&owned);
    let mut content = create_rich_text_content();
    let mut stack: Vec<TextFormat> = vec![TextFormat::default()];
    let mut index = 0_usize;
    while let Some(start) = html[index..].find('<') {
        let token_start = index + start;
        let Some(close) = html[token_start..].find('>') else {
            break;
        };
        let token_end = token_start + close + 1;
        let text = &html[index..token_start];
        let top = stack.last().cloned().unwrap_or_default();
        append_markup_text(&mut content, text, &top);
        let offset = utf16_len(&html[..token_start]);
        handle_markup_token(
            &mut content,
            registry,
            &html[token_start..token_end],
            offset,
            &mut stack,
            report,
        );
        index = token_end;
    }
    let top = stack.last().cloned().unwrap_or_default();
    append_markup_text(&mut content, &html[index..], &top);
    return content;
}

fn push_markup_range(content: &mut RichTextContent, format: &TextFormat, start: usize, end: usize) {
    if start == end || is_markup_format_empty(format) {
        return;
    }
    if let Some(previous) = content.format_ranges.last_mut() {
        if previous.end == start && *previous.format.read().unwrap() == *format {
            previous.end = end;
            return;
        }
    }
    content.format_ranges.push(create_text_format_range(
        Arc::new(RwLock::new(format.clone())),
        start,
        end,
    ));
}

fn resolve_markup_format_runs(content: &RichTextContent) -> Vec<MarkupFormatRun> {
    let length = utf16_len(&content.text);
    let mut boundaries: Vec<usize> = vec![0, length];
    let mut ranges: Vec<(usize, usize, TextFormat)> = Vec::new();
    for range in &content.format_ranges {
        let start = range.start.min(length);
        let end = range.end.min(length).max(start);
        if start == end {
            continue;
        }
        boundaries.push(start);
        boundaries.push(end);
        ranges.push((start, end, range.format.read().unwrap().clone()));
    }
    boundaries.sort_unstable();
    boundaries.dedup();
    let mut runs: Vec<MarkupFormatRun> = Vec::new();
    for index in 0..boundaries.len().saturating_sub(1) {
        let start = boundaries[index];
        let end = boundaries[index + 1];
        let mut format = TextFormat::default();
        for (range_start, range_end, range_format) in &ranges {
            if *range_start <= start && *range_end >= end {
                format = merge_markup_format(&format, range_format);
            }
        }
        if let Some(previous) = runs.last_mut() {
            if previous.format == format {
                previous.end = end;
                continue;
            }
        }
        runs.push(MarkupFormatRun { start, end, format });
    }
    return runs;
}

fn utf16_len(value: &str) -> usize {
    return value.encode_utf16().count();
}

fn utf16_slice(value: &str, start: usize, end: usize) -> &str {
    let mut utf16 = 0_usize;
    let mut byte_start = value.len();
    let mut byte_end = value.len();
    for (byte, character) in value.char_indices() {
        if utf16 == start {
            byte_start = byte;
        }
        if utf16 == end {
            byte_end = byte;
            break;
        }
        utf16 += character.len_utf16();
    }
    if utf16 == start {
        byte_start = value.len();
    }
    if end >= utf16_len(value) {
        byte_end = value.len();
    }
    return &value[byte_start..byte_end];
}
