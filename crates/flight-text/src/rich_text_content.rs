use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_textformat::{TextFormat, TextFormatRange, merge_text_format};
use flight_textlayout::{RichTextContent, create_rich_text_content, create_text_format_range};

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
        if out.text.is_empty() || out.text.ends_with(' ') {
            value = value
                .trim_start_matches(is_condensed_whitespace)
                .to_string();
        }
    }
    if value.is_empty() {
        return;
    }

    let value_length = value.encode_utf16().count();
    let remaining = if max_chars < 0 {
        value_length
    } else {
        (max_chars as usize).saturating_sub(out.text.encode_utf16().count())
    };
    if remaining == 0 {
        return;
    }
    if value_length > remaining {
        value = take_utf16_prefix(&value, remaining);
    }

    let start = out.text.encode_utf16().count();
    out.text.push_str(&value);
    let end = out.text.encode_utf16().count();
    write_format_range(&mut out.format_ranges, format, start, end);
}

fn apply_text_format_ranges(out: &mut RichTextContent, overrides: &[TextFormatRange]) {
    if overrides.is_empty() || out.text.is_empty() {
        return;
    }
    let text_length = out.text.encode_utf16().count();
    let mut ranges = std::mem::take(&mut out.format_ranges);
    for r#override in overrides {
        let start = r#override.start.min(text_length);
        let end = r#override.end.max(start).min(text_length);
        if start == end {
            continue;
        }
        let override_format = r#override.format.read().unwrap().clone();
        let mut next = Vec::new();
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

fn clamp_ranges(ranges: &mut Vec<TextFormatRange>, length: usize) {
    ranges.retain_mut(|range| {
        if range.start >= length {
            return false;
        }
        range.end = range.end.min(length);
        return true;
    });
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
    out.text.clear();
    out.format_ranges.clear();

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
    let length = out.text.encode_utf16().count();
    clamp_ranges(&mut out.format_ranges, length);
    apply_text_format_ranges(out, &data.text_format_ranges);
}

fn condense_whitespace(value: &str) -> String {
    let mut out = String::new();
    let mut whitespace = false;
    for character in value.chars() {
        if is_condensed_whitespace(character) {
            if !whitespace {
                out.push(' ');
                whitespace = true;
            }
        } else {
            out.push(character);
            whitespace = false;
        }
    }
    return out;
}

fn decode_entity(entity: &str) -> Option<String> {
    let lower = entity.to_ascii_lowercase();
    let decoded = match lower.as_str() {
        "amp" => "&",
        "apos" => "'",
        "gt" => ">",
        "lt" => "<",
        "nbsp" => " ",
        "quot" => "\"",
        _ => {
            let codepoint = if let Some(hex) = lower.strip_prefix("#x") {
                u32::from_str_radix(hex, 16).ok()
            } else if let Some(decimal) = lower.strip_prefix('#') {
                decimal.parse::<u32>().ok()
            } else {
                None
            }?;
            return char::from_u32(codepoint).map(|value| value.to_string());
        }
    };
    return Some(decoded.to_string());
}

fn decode_html_entities(value: &str) -> String {
    let mut out = String::new();
    let mut rest = value;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after_amp = &rest[amp + 1..];
        let Some(semi) = after_amp.find(';') else {
            out.push_str(&rest[amp..]);
            return out;
        };
        let entity = &after_amp[..semi];
        if let Some(decoded) = decode_entity(entity) {
            out.push_str(&decoded);
        } else {
            out.push('&');
            out.push_str(entity);
            out.push(';');
        }
        rest = &after_amp[semi + 1..];
    }
    out.push_str(rest);
    return out;
}

fn get_renderable_source(data: &RichTextData, password_character: Option<&str>) -> String {
    let Some(password_character) = password_character else {
        return data.text.clone();
    };
    let mask = password_character
        .chars()
        .next()
        .unwrap_or('\u{2022}')
        .to_string();
    return mask.repeat(data.text.encode_utf16().count());
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn get_rich_text_content(runtime: &mut RichTextRuntime) -> Ref<RichTextContent> {
    if runtime.rich_text_content.is_none() {
        runtime.rich_text_content = Some(Arc::new(RwLock::new(create_rich_text_content())));
    }
    return runtime.rich_text_content.as_ref().unwrap().clone();
}

fn is_condensed_whitespace(character: char) -> bool {
    return matches!(
        character,
        ' ' | '\u{000c}' | '\n' | '\r' | '\t' | '\u{000b}'
    );
}

fn take_utf16_prefix(value: &str, limit: usize) -> String {
    let mut units = 0;
    return value
        .chars()
        .take_while(|character| {
            let next = units + character.len_utf16();
            if next > limit {
                return false;
            }
            units = next;
            return true;
        })
        .collect();
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
    if let Some(previous) = ranges.last_mut()
        && previous.end == start
        && *previous.format.read().unwrap() == *format
    {
        previous.end = end;
        return;
    }
    ranges.push(create_text_format_range(
        Arc::new(RwLock::new(format.clone())),
        start,
        end,
    ));
}
