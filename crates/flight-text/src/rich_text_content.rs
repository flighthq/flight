use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_textformat::create_text_format_range;
use flight_textformat::{TextFormat, TextFormatRange, merge_text_format};
use flight_textlayout::{RichTextContent, create_rich_text_content};

use crate::types::{RichTextData, RichTextRuntime};

fn create_base_format(data: &RichTextData) -> TextFormat {
    let default_format = data.default_text_format.read().unwrap();
    let text_format = data.text_format.read().unwrap();
    let mut format = merge_text_format(&default_format, &text_format);
    if format.color.is_none() {
        format.color = Some(data.text_color);
    }
    return format;
}

fn append_text(
    out: &mut RichTextContent,
    text: &str,
    format: &TextFormat,
    condense_white: bool,
    max_chars: i32,
) {
    let mut value = decode_html_entities(text);
    if condense_white {
        value = condense_whitespace(&value);
        if out.text.is_empty() || string_ends_with(&out.text, ' ') {
            value = value
                .trim_start_matches(is_condensed_whitespace)
                .to_string();
        }
    }
    if value.is_empty() {
        return;
    }

    let value_length = utf16_len(&value);
    let remaining = if max_chars < 0 {
        value_length
    } else {
        saturating_sub(max_chars as usize, utf16_len(&out.text))
    };
    if remaining == 0 {
        return;
    }
    if value_length > remaining {
        value = take_utf16_prefix(&value, remaining);
    }

    let start = utf16_len(&out.text);
    out.text = format!("{}{}", out.text, value);
    let end = utf16_len(&out.text);
    write_format_range(&mut out.format_ranges, format, start, end);
}

fn apply_text_format_ranges(out: &mut RichTextContent, overrides: &[TextFormatRange]) {
    if overrides.is_empty() || out.text.is_empty() {
        return;
    }
    let text_length = utf16_len(&out.text);
    let source_ranges = &out.format_ranges;
    let mut ranges: Vec<TextFormatRange> = Vec::new();
    for range in source_ranges {
        ranges.push(range.clone());
    }
    out.format_ranges = Vec::new();
    for r#override in overrides {
        let start = r#override.start.min(text_length);
        let end = r#override.end.max(start).min(text_length);
        if start == end {
            continue;
        }
        let override_format = r#override.format.read().unwrap().clone();
        let mut next: Vec<TextFormatRange> = Vec::new();
        for range in ranges {
            let range_format = range.format.read().unwrap().clone();
            if range.end <= start || range.start >= end {
                write_format_range(&mut next, &range_format, range.start, range.end);
                continue;
            }
            if range.start < start {
                write_format_range(&mut next, &range_format, range.start, start);
            }
            let merged = merge_text_format(&range_format, &override_format);
            write_format_range(
                &mut next,
                &merged,
                range.start.max(start),
                range.end.min(end),
            );
            if range.end > end {
                write_format_range(&mut next, &range_format, end, range.end);
            }
        }
        ranges = next;
    }
    for range in ranges {
        let format = range.format.read().unwrap().clone();
        write_format_range(&mut out.format_ranges, &format, range.start, range.end);
    }
}

fn character_utf16_len(character: char) -> usize {
    return utf16_len(&character.to_string());
}

fn clamp_ranges(ranges: &mut Vec<TextFormatRange>, length: usize) {
    for range in ranges.iter_mut() {
        range.end = range.end.min(length);
    }
    ranges.retain(|range| range.start < length);
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn clear_rich_text_content(runtime: &mut RichTextRuntime) {
    runtime.rich_text_content = None;
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn compute_rich_text_content(
    out: &mut RichTextContent,
    data: &RichTextData,
    password_character: Option<&str>,
) {
    out.text = String::new();
    out.format_ranges = Vec::new();

    let base_format = create_base_format(data);
    let source = get_renderable_source(data, password_character);
    if source.is_empty() {
        return;
    }
    append_text(
        out,
        &source,
        &base_format,
        data.condense_white,
        data.max_chars,
    );
    let length = utf16_len(&out.text);
    clamp_ranges(&mut out.format_ranges, length);
    apply_text_format_ranges(out, &data.text_format_ranges);
}

fn condense_whitespace(value: &str) -> String {
    let mut out = String::new();
    let mut whitespace = false;
    for character in value.chars() {
        if is_condensed_whitespace(character) {
            if !whitespace {
                out = format!("{}{}", out, ' ');
                whitespace = true;
            }
        } else {
            out = format!("{}{}", out, character);
            whitespace = false;
        }
    }
    return out;
}

fn decode_entity(entity: &str) -> Option<String> {
    let lower = entity.to_ascii_lowercase();
    if lower == "amp" {
        return Some("&".to_string());
    }
    if lower == "apos" {
        return Some("'".to_string());
    }
    if lower == "gt" {
        return Some(">".to_string());
    }
    if lower == "lt" {
        return Some("<".to_string());
    }
    if lower == "nbsp" {
        return Some(" ".to_string());
    }
    if lower == "quot" {
        return Some("\"".to_string());
    }
    if string_starts_with(&lower, "#x") {
        return decode_entity_codepoint(&lower[2..lower.len()], 16);
    }
    if string_starts_with(&lower, "#") {
        return decode_entity_codepoint(&lower[1..lower.len()], 10);
    }
    return None;
}

fn decode_entity_codepoint(digits: &str, radix: u32) -> Option<String> {
    let codepoint = u32::from_str_radix(digits, radix).unwrap_or(u32::MAX);
    return char::from_u32(codepoint).map(|value| value.to_string());
}

fn decode_html_entities(value: &str) -> String {
    let mut out = String::new();
    let mut rest = value;
    while let Some(amp) = rest.find('&') {
        out = format!("{}{}", out, &rest[0..amp]);
        let after_amp = &rest[amp + 1..rest.len()];
        let Some(semi) = after_amp.find(';') else {
            out = format!("{}{}", out, &rest[amp..rest.len()]);
            return out;
        };
        let entity = &after_amp[0..semi];
        let decoded = decode_entity(entity);
        if decoded.is_some() {
            out = format!("{}{}", out, decoded.unwrap());
        } else {
            out = format!("{}{}{}{}", out, '&', entity, ';');
        }
        rest = &after_amp[semi + 1..after_amp.len()];
    }
    out = format!("{}{}", out, rest);
    return out;
}

fn first_character(value: &str) -> Option<char> {
    return value.chars().next();
}

fn get_renderable_source(data: &RichTextData, password_character: Option<&str>) -> String {
    let Some(password_character) = password_character else {
        return data.text.clone();
    };
    let mask = first_character(password_character)
        .unwrap_or('\u{2022}')
        .to_string();
    return repeat_string(&mask, utf16_len(&data.text));
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn get_rich_text_content(runtime: &mut RichTextRuntime) -> Ref<RichTextContent> {
    if runtime.rich_text_content.is_none() {
        runtime.rich_text_content = Some(Arc::new(RwLock::new(create_rich_text_content())));
    }
    return runtime.rich_text_content.as_ref().unwrap().clone();
}

fn is_condensed_whitespace(character: char) -> bool {
    return character == ' '
        || character == '\u{000c}'
        || character == '\n'
        || character == '\r'
        || character == '\t'
        || character == '\u{000b}';
}

fn repeat_string(value: &str, count: usize) -> String {
    let mut out = String::new();
    for _ in 0..count {
        out = format!("{}{}", out, value);
    }
    return out;
}

fn saturating_sub(value: usize, amount: usize) -> usize {
    if amount >= value {
        return 0;
    }
    return value - amount;
}

fn string_ends_with(value: &str, suffix: char) -> bool {
    return value.ends_with(suffix);
}

fn string_starts_with(value: &str, prefix: &str) -> bool {
    return value.starts_with(prefix);
}

fn take_utf16_prefix(value: &str, limit: usize) -> String {
    let mut units = 0;
    let mut out = String::new();
    for character in value.chars() {
        let next = units + character_utf16_len(character);
        if next > limit {
            break;
        }
        units = next;
        out = format!("{}{}", out, character);
    }
    return out;
}

fn utf16_len(value: &str) -> usize {
    return value.encode_utf16().count();
}

fn write_format_range(
    ranges: &mut Vec<TextFormatRange>,
    format: &TextFormat,
    start: usize,
    end: usize,
) {
    if start == end {
        return;
    }
    if !ranges.is_empty() {
        let previous_index = ranges.len() - 1;
        let previous = &mut ranges[previous_index];
        if previous.end == start && *previous.format.read().unwrap() == *format {
            previous.end = end;
            return;
        }
    }
    ranges.push(create_text_format_range(
        Arc::new(RwLock::new(format.clone())),
        start,
        end,
    ));
}
