use std::collections::HashMap;

use flighthq_types::{RichTextContent, RichTextData, TextFormat, TextFormatAlign, TextFormatRange};

use crate::text_format::merge_text_format;

/// Clears the cached rich text content, forcing a recompute on next access.
pub fn clear_rich_text_content(content: &mut Option<RichTextContent>) {
    *content = None;
}

/// Builds the flat text + format-ranges representation from `data`, applying
/// optional password masking. Writes into `out` in place.
///
/// `password_character` drives masking: `None` leaves the text visible; `Some`
/// masks every character with it. A maximum-character count of `0` means
/// unlimited (matching the Rust default), any positive value caps the length.
pub fn compute_rich_text_content(
    out: &mut RichTextContent,
    data: &RichTextData,
    password_character: Option<char>,
) {
    out.text.clear();
    out.format_ranges.clear();

    let base_format = create_base_format(data);
    let source = get_renderable_source(data, password_character);
    if source.is_empty() {
        return;
    }

    if data.html_text.is_empty() || password_character.is_some() {
        append_text(
            out,
            &source,
            &base_format,
            data.condense_white,
            data.max_chars,
        );
    } else {
        parse_html_text(out, &source, data, base_format);
    }

    clamp_ranges(&mut out.format_ranges, out.text.chars().count());
    apply_text_format_ranges(out, &data.text_format_ranges);
}

/// Allocates an empty `RichTextContent`.
pub fn create_rich_text_content() -> RichTextContent {
    RichTextContent {
        format_ranges: Vec::new(),
        text: String::new(),
    }
}

/// Returns the cached `RichTextContent`, lazily initializing it if absent.
pub fn get_rich_text_content(cache: &mut Option<RichTextContent>) -> &mut RichTextContent {
    if cache.is_none() {
        *cache = Some(create_rich_text_content());
    }
    cache.as_mut().expect("cache was just initialized")
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn append_line_break(out: &mut RichTextContent, max_chars: u32) {
    if max_chars > 0 && out.text.chars().count() as u32 >= max_chars {
        return;
    }
    out.text.push('\n');
}

fn append_text(
    out: &mut RichTextContent,
    text: &str,
    format: &TextFormat,
    condense_white: bool,
    max_chars: u32,
) {
    let mut value = decode_html_entities(text);
    if condense_white {
        value = condense_whitespace(&value);
        if out.text.is_empty() {
            value = value.trim_start().to_string();
        }
        if out.text.ends_with(' ') {
            value = value.trim_start().to_string();
        }
    }
    if value.is_empty() {
        return;
    }

    let current_len = out.text.chars().count();
    let value_len = value.chars().count();
    let remaining = if max_chars == 0 {
        value_len
    } else {
        (max_chars as usize).saturating_sub(current_len)
    };
    if remaining == 0 {
        return;
    }
    if value_len > remaining {
        value = value.chars().take(remaining).collect();
    }

    let start = out.text.chars().count();
    out.text.push_str(&value);
    let end = out.text.chars().count();
    write_format_range(&mut out.format_ranges, format.clone(), start, end);
}

fn apply_attribute_format(format: &mut TextFormat, name: &str, value: &str) {
    match name {
        "align" => {
            if let Some(align) = parse_text_align(value) {
                format.align = Some(align);
            }
        }
        "blockindent" => format.block_indent = Some(parse_number(value)),
        "color" => format.color = Some(parse_color(value)),
        "face" | "font" | "fontfamily" => format.font = Some(value.to_string()),
        "indent" => format.indent = Some(parse_number(value)),
        "leading" => format.leading = Some(parse_number(value)),
        "leftmargin" => format.left_margin = Some(parse_number(value)),
        "letterspacing" => format.letter_spacing = Some(parse_number(value)),
        "rightmargin" => format.right_margin = Some(parse_number(value)),
        "size" => format.size = Some(parse_number(value)),
        "tabstops" => format.tab_stops = Some(parse_tab_stops(value)),
        _ => {}
    }
}

fn apply_css_format(format: &mut TextFormat, property: &str, value: &str) {
    match property {
        "color" => format.color = Some(parse_color(value)),
        "font-family" => format.font = Some(strip_quotes(value)),
        "font-size" => format.size = Some(parse_number(value)),
        "font-style" => {
            if value == "italic" || value == "oblique" {
                format.italic = Some(true);
            }
        }
        "font-weight" => {
            if value == "bold" || parse_number(value) >= 600.0 {
                format.bold = Some(true);
            }
        }
        "letter-spacing" => format.letter_spacing = Some(parse_number(value)),
        "line-height" => format.leading = Some(parse_number(value)),
        "margin-left" => format.left_margin = Some(parse_number(value)),
        "margin-right" => format.right_margin = Some(parse_number(value)),
        "text-align" => {
            if let Some(align) = parse_text_align(value) {
                format.align = Some(align);
            }
        }
        "text-decoration" => {
            if value.contains("underline") {
                format.underline = Some(true);
            }
            if value.contains("line-through") {
                format.strikethrough = Some(true);
            }
        }
        "text-indent" => format.indent = Some(parse_number(value)),
        _ => {}
    }
}

fn apply_inline_style(format: &mut TextFormat, style: &str) {
    for declaration in style.split(';') {
        let separator = match declaration.find(':') {
            Some(s) => s,
            None => continue,
        };
        let property = declaration[..separator].trim().to_lowercase();
        let value = declaration[separator + 1..].trim().to_lowercase();
        if !property.is_empty() && !value.is_empty() {
            apply_css_format(format, &property, &value);
        }
    }
}

fn apply_style_sheet_format(
    format: &mut TextFormat,
    data: &RichTextData,
    tag: &str,
    attrs: &Attributes,
) {
    let style_sheet = match &data.style_sheet {
        Some(s) => s,
        None => return,
    };

    merge_format_into(format, style_sheet.get(tag));
    if let Some(class_name) = attrs.get("class") {
        for name in class_name.split_whitespace() {
            if !name.is_empty() {
                merge_format_into(format, style_sheet.get(&format!(".{}", name)));
                merge_format_into(format, style_sheet.get(name));
            }
        }
    }

    if let Some(id) = attrs.get("id") {
        merge_format_into(format, style_sheet.get(&format!("#{}", id)));
    }
}

fn apply_tag_format(format: &mut TextFormat, tag: &str, attrs: &Attributes) {
    match tag {
        "b" | "strong" => format.bold = Some(true),
        "em" | "i" => format.italic = Some(true),
        "font" => {
            for (name, value) in attrs {
                apply_attribute_format(format, name, value);
            }
        }
        "li" => format.bullet = Some(true),
        "p" => {
            if let Some(align) = attrs.get("align") {
                if let Some(a) = parse_text_align(align) {
                    format.align = Some(a);
                }
            }
        }
        "a" => {
            if let Some(href) = attrs.get("href") {
                format.url = Some(href.clone());
            }
            if let Some(target) = attrs.get("target") {
                format.target = Some(target.clone());
            }
        }
        "textformat" => {
            for (name, value) in attrs {
                apply_attribute_format(format, name, value);
            }
        }
        "s" | "strike" => format.strikethrough = Some(true),
        "u" => format.underline = Some(true),
        _ => {}
    }

    if let Some(style) = attrs.get("style") {
        apply_inline_style(format, style);
    }
}

fn apply_text_format_ranges(out: &mut RichTextContent, overrides: &[TextFormatRange]) {
    let text_len = out.text.chars().count();
    if overrides.is_empty() || text_len == 0 {
        return;
    }

    let mut ranges = out.format_ranges.clone();
    for over in overrides {
        let start = over.start.min(text_len);
        let end = over.end.min(text_len).max(start);
        if start == end {
            continue;
        }

        let mut next: Vec<TextFormatRange> = Vec::new();
        for range in &ranges {
            if range.end <= start || range.start >= end {
                write_format_range(&mut next, range.format.clone(), range.start, range.end);
                continue;
            }

            if range.start < start {
                write_format_range(&mut next, range.format.clone(), range.start, start);
            }
            write_format_range(
                &mut next,
                merge_text_format(&range.format, &over.format),
                range.start.max(start),
                range.end.min(end),
            );
            if range.end > end {
                write_format_range(&mut next, range.format.clone(), end, range.end);
            }
        }
        ranges = next;
    }

    out.format_ranges.clear();
    for range in &ranges {
        write_format_range(
            &mut out.format_ranges,
            range.format.clone(),
            range.start,
            range.end,
        );
    }
}

fn clamp_ranges(ranges: &mut Vec<TextFormatRange>, length: usize) {
    let mut i = ranges.len();
    while i > 0 {
        i -= 1;
        if ranges[i].start >= length {
            ranges.remove(i);
        } else if ranges[i].end > length {
            ranges[i].end = length;
        }
    }
}

fn condense_whitespace(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut in_space = false;
    for c in value.chars() {
        if matches!(c, ' ' | '\u{000C}' | '\n' | '\r' | '\t' | '\u{000B}') {
            if !in_space {
                result.push(' ');
                in_space = true;
            }
        } else {
            result.push(c);
            in_space = false;
        }
    }
    result
}

fn create_base_format(data: &RichTextData) -> TextFormat {
    // The Rust `RichTextData` folds the base format into `default_text_format`
    // (there is no separate `text_format` field as in the TS payload), so the
    // base format is the default format directly.
    let mut format = data.default_text_format.clone();
    if format.color.is_none() {
        format.color = Some(data.text_color);
    }
    format
}

fn decode_html_entities(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let bytes: Vec<char> = value.chars().collect();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == '&' {
            // Find the terminating ';' for an entity body of [#x..|#..|alpha..].
            if let Some(semi) = find_entity_end(&bytes, i + 1) {
                let entity: String = bytes[i + 1..semi].iter().collect();
                let lower = entity.to_lowercase();
                let decoded = if let Some(hex) = lower.strip_prefix("#x") {
                    u32::from_str_radix(hex, 16)
                        .ok()
                        .and_then(char::from_u32)
                        .map(|c| c.to_string())
                } else if let Some(dec) = lower.strip_prefix('#') {
                    dec.parse::<u32>()
                        .ok()
                        .and_then(char::from_u32)
                        .map(|c| c.to_string())
                } else {
                    named_entity(&lower).map(|s| s.to_string())
                };
                match decoded {
                    Some(s) => {
                        result.push_str(&s);
                        i = semi + 1;
                        continue;
                    }
                    None => {
                        result.push_str(&format!("&{};", entity));
                        i = semi + 1;
                        continue;
                    }
                }
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    result
}

// Returns the index of the ';' closing a valid entity body that begins at
// `start`, matching the TS regex `#x[0-9a-f]+|#[0-9]+|[a-z]+`.
fn find_entity_end(chars: &[char], start: usize) -> Option<usize> {
    if start >= chars.len() {
        return None;
    }
    let mut i = start;
    let body_ok;
    if chars[i] == '#' {
        i += 1;
        if i < chars.len() && (chars[i] == 'x' || chars[i] == 'X') {
            i += 1;
            let body_start = i;
            while i < chars.len() && chars[i].is_ascii_hexdigit() {
                i += 1;
            }
            body_ok = i > body_start;
        } else {
            let body_start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            body_ok = i > body_start;
        }
    } else {
        let body_start = i;
        while i < chars.len() && chars[i].is_ascii_alphabetic() {
            i += 1;
        }
        body_ok = i > body_start;
    }
    if body_ok && i < chars.len() && chars[i] == ';' {
        Some(i)
    } else {
        None
    }
}

fn get_renderable_source(data: &RichTextData, password_character: Option<char>) -> String {
    match password_character {
        None => {
            if !data.html_text.is_empty() {
                data.html_text.clone()
            } else {
                data.text.clone()
            }
        }
        Some(c) => {
            let mask = if c == '\0' { '\u{2022}' } else { c };
            mask.to_string().repeat(data.text.chars().count())
        }
    }
}

fn handle_html_tag(
    out: &mut RichTextContent,
    token: &str,
    data: &RichTextData,
    stack: &mut Vec<TextFormat>,
) {
    // token includes the surrounding `<` and `>`.
    let content = token[1..token.len() - 1].trim();
    if content.is_empty() || content.starts_with('!') {
        return;
    }

    let closing = content.starts_with('/');
    let self_closing = content.ends_with('/');
    let body_owned = if closing {
        content[1..].to_string()
    } else {
        content.to_string()
    };
    let body = body_owned.trim_end_matches('/').trim();
    let separator = body.find(char::is_whitespace);
    let tag = match separator {
        Some(s) => body[..s].to_lowercase(),
        None => body.to_lowercase(),
    };
    let attrs = parse_attributes(match separator {
        Some(s) => &body[s + 1..],
        None => "",
    });

    if closing {
        if stack.len() > 1 {
            stack.pop();
        }
        if tag == "p" && !out.text.is_empty() && !out.text.ends_with('\n') {
            append_line_break(out, data.max_chars);
        }
        return;
    }

    if tag == "br" {
        append_line_break(out, data.max_chars);
        return;
    }

    if (tag == "p" || tag == "li") && !out.text.is_empty() && !out.text.ends_with('\n') {
        append_line_break(out, data.max_chars);
    }

    let mut format = stack
        .last()
        .expect("stack always has a base format")
        .clone();
    apply_style_sheet_format(&mut format, data, &tag, &attrs);
    apply_tag_format(&mut format, &tag, &attrs);

    if !self_closing {
        stack.push(format);
    }
}

fn merge_format_into(format: &mut TextFormat, style: Option<&TextFormat>) {
    let style = match style {
        Some(s) => s,
        None => return,
    };
    *format = merge_text_format(format, style);
}

fn parse_attributes(source: &str) -> Attributes {
    let mut attrs = Attributes::new();
    let chars: Vec<char> = source.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        // Skip whitespace.
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        // Read attribute name: [^\s=]+
        let name_start = i;
        while i < chars.len() && !chars[i].is_whitespace() && chars[i] != '=' {
            i += 1;
        }
        if i == name_start {
            // No name token (e.g. stray '='); advance to avoid infinite loop.
            if i < chars.len() {
                i += 1;
            }
            continue;
        }
        let name: String = chars[name_start..i]
            .iter()
            .collect::<String>()
            .to_lowercase();

        // Optional `= value`.
        let mut value = String::new();
        let save = i;
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i < chars.len() && chars[i] == '=' {
            i += 1;
            while i < chars.len() && chars[i].is_whitespace() {
                i += 1;
            }
            if i < chars.len() && (chars[i] == '"' || chars[i] == '\'') {
                let quote = chars[i];
                i += 1;
                let v_start = i;
                while i < chars.len() && chars[i] != quote {
                    i += 1;
                }
                value = chars[v_start..i].iter().collect();
                if i < chars.len() {
                    i += 1; // consume closing quote
                }
            } else {
                let v_start = i;
                while i < chars.len()
                    && !chars[i].is_whitespace()
                    && chars[i] != '"'
                    && chars[i] != '\''
                    && chars[i] != '>'
                {
                    i += 1;
                }
                value = chars[v_start..i].iter().collect();
            }
        } else {
            i = save;
        }

        attrs.insert(name, value);
    }
    attrs
}

fn parse_color(value: &str) -> u32 {
    let color = value.trim().to_lowercase();
    if let Some(rest) = color.strip_prefix('#') {
        if rest.len() == 3 {
            let mut expanded = String::with_capacity(6);
            for c in rest.chars() {
                expanded.push(c);
                expanded.push(c);
            }
            return u32::from_str_radix(&expanded, 16).unwrap_or(0);
        }
        return u32::from_str_radix(rest, 16).unwrap_or(0);
    }
    if let Some(rest) = color.strip_prefix("0x") {
        return u32::from_str_radix(rest, 16).unwrap_or(0);
    }
    named_color(&color).unwrap_or(0)
}

fn parse_html_text(
    out: &mut RichTextContent,
    source: &str,
    data: &RichTextData,
    base_format: TextFormat,
) {
    let mut stack: Vec<TextFormat> = vec![base_format];
    let chars: Vec<char> = source.chars().collect();
    let mut index = 0; // char index into source
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '<' {
            // Find the matching '>'.
            if let Some(close) = chars[i..].iter().position(|&c| c == '>') {
                let close = i + close;
                let preceding: String = chars[index..i].iter().collect();
                let top = stack.last().expect("stack base").clone();
                append_text(out, &preceding, &top, data.condense_white, data.max_chars);
                let token: String = chars[i..=close].iter().collect();
                handle_html_tag(out, &token, data, &mut stack);
                index = close + 1;
                i = close + 1;
                continue;
            }
        }
        i += 1;
    }

    let trailing: String = chars[index..].iter().collect();
    let top = stack.last().expect("stack base").clone();
    append_text(out, &trailing, &top, data.condense_white, data.max_chars);
}

fn parse_number(value: &str) -> f32 {
    value
        .trim()
        .parse::<f32>()
        .ok()
        .filter(|v| v.is_finite())
        .unwrap_or(0.0)
}

fn parse_tab_stops(value: &str) -> Vec<f32> {
    value
        .split(',')
        .map(|part| parse_number(part.trim()))
        .filter(|v| v.is_finite())
        .collect()
}

fn parse_text_align(value: &str) -> Option<TextFormatAlign> {
    match value {
        "center" => Some(TextFormatAlign::Center),
        "end" => Some(TextFormatAlign::End),
        "justify" => Some(TextFormatAlign::Justify),
        "left" => Some(TextFormatAlign::Left),
        "right" => Some(TextFormatAlign::Right),
        "start" => Some(TextFormatAlign::Start),
        _ => None,
    }
}

fn strip_quotes(value: &str) -> String {
    value.trim_matches(|c| c == '\'' || c == '"').to_string()
}

/// Writes a format range into `ranges`, merging with the previous range if
/// they are adjacent and have identical format fields.
pub(crate) fn write_format_range(
    ranges: &mut Vec<TextFormatRange>,
    format: TextFormat,
    start: usize,
    end: usize,
) {
    if start == end {
        return;
    }
    if let Some(previous) = ranges.last_mut() {
        if previous.end == start && text_format_equals(&previous.format, &format) {
            previous.end = end;
            return;
        }
    }
    ranges.push(TextFormatRange { end, format, start });
}

fn text_format_equals(a: &TextFormat, b: &TextFormat) -> bool {
    a.align == b.align
        && a.block_indent == b.block_indent
        && a.bold == b.bold
        && a.bullet == b.bullet
        && a.color == b.color
        && a.font == b.font
        && a.indent == b.indent
        && a.italic == b.italic
        && a.kerning == b.kerning
        && a.leading == b.leading
        && a.left_margin == b.left_margin
        && a.letter_spacing == b.letter_spacing
        && a.right_margin == b.right_margin
        && a.size == b.size
        && a.strikethrough == b.strikethrough
        && a.tab_stops == b.tab_stops
        && a.target == b.target
        && a.underline == b.underline
        && a.url == b.url
}

type Attributes = HashMap<String, String>;

fn named_color(name: &str) -> Option<u32> {
    Some(match name {
        "black" => 0x000000,
        "blue" => 0x0000ff,
        "cyan" => 0x00ffff,
        "fuchsia" => 0xff00ff,
        "gray" => 0x808080,
        "green" => 0x008000,
        "lime" => 0x00ff00,
        "magenta" => 0xff00ff,
        "maroon" => 0x800000,
        "navy" => 0x000080,
        "olive" => 0x808000,
        "purple" => 0x800080,
        "red" => 0xff0000,
        "silver" => 0xc0c0c0,
        "teal" => 0x008080,
        "white" => 0xffffff,
        "yellow" => 0xffff00,
        _ => return None,
    })
}

fn named_entity(name: &str) -> Option<&'static str> {
    Some(match name {
        "amp" => "&",
        "apos" => "'",
        "gt" => ">",
        "lt" => "<",
        "nbsp" => " ",
        "quot" => "\"",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{RichTextData, TextFormat, TextFormatRange};

    fn create_data() -> RichTextData {
        RichTextData {
            height: 100.0,
            multiline: true,
            scroll_v: 1.0,
            width: 100.0,
            ..Default::default()
        }
    }

    #[test]
    fn clear_rich_text_content_sets_none() {
        let mut cache: Option<RichTextContent> = Some(create_rich_text_content());
        clear_rich_text_content(&mut cache);
        assert!(cache.is_none());
    }

    #[test]
    fn create_rich_text_content_empty() {
        let content = create_rich_text_content();
        assert_eq!(content.text, "");
        assert!(content.format_ranges.is_empty());
    }

    #[test]
    fn compute_rich_text_content_uses_plain_text() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            text: "hello".to_string(),
            text_color: 0x336699,
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "hello");
        assert_eq!(content.format_ranges.len(), 1);
        assert_eq!(content.format_ranges[0].format.color, Some(0x336699));
    }

    #[test]
    fn compute_rich_text_content_prefers_html_text() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<b>rich</b>".to_string(),
            text: "plain".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "rich");
        assert_eq!(content.format_ranges[0].format.bold, Some(true));
    }

    #[test]
    fn compute_rich_text_content_decodes_entities_and_br() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "A&amp;B<br>C".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "A&B\nC");
    }

    #[test]
    fn compute_rich_text_content_applies_font_tags() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<font face=\"Arial\" color=\"#ff00aa\" size=\"18\">Hi</font>".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(
            content.format_ranges[0].format.font.as_deref(),
            Some("Arial")
        );
        assert_eq!(content.format_ranges[0].format.color, Some(0xff00aa));
        assert_eq!(content.format_ranges[0].format.size, Some(18.0));
    }

    #[test]
    fn compute_rich_text_content_applies_nested_style_tags() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<b>bold <i>both</i></b> normal".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "bold both normal");
        assert_eq!(content.format_ranges[0].format.bold, Some(true));
        assert_eq!(content.format_ranges[1].format.bold, Some(true));
        assert_eq!(content.format_ranges[1].format.italic, Some(true));
        assert_eq!(content.format_ranges[2].format.bold, None);
    }

    #[test]
    fn compute_rich_text_content_applies_paragraph_and_textformat() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text:
                "<p align=\"center\"><textformat leftmargin=\"4\" leading=\"3\">Hi</textformat></p>"
                    .to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "Hi\n");
        assert_eq!(
            content.format_ranges[0].format.align,
            Some(TextFormatAlign::Center)
        );
        assert_eq!(content.format_ranges[0].format.left_margin, Some(4.0));
        assert_eq!(content.format_ranges[0].format.leading, Some(3.0));
    }

    #[test]
    fn compute_rich_text_content_applies_anchor_links() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<a href=\"https://example.com\" target=\"_blank\">Link</a>".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "Link");
        assert_eq!(
            content.format_ranges[0].format.url.as_deref(),
            Some("https://example.com")
        );
        assert_eq!(
            content.format_ranges[0].format.target.as_deref(),
            Some("_blank")
        );
    }

    #[test]
    fn compute_rich_text_content_applies_stylesheet_and_inline_css() {
        let mut style_sheet = std::collections::HashMap::new();
        style_sheet.insert(
            ".callout".to_string(),
            TextFormat {
                color: Some(0x445566),
                size: Some(20.0),
                ..Default::default()
            },
        );
        style_sheet.insert(
            "p".to_string(),
            TextFormat {
                align: Some(TextFormatAlign::Right),
                ..Default::default()
            },
        );
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<p class=\"callout\" style=\"font-weight:bold;text-decoration:underline\">Styled</p>"
                .to_string(),
            style_sheet: Some(style_sheet),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(
            content.format_ranges[0].format.align,
            Some(TextFormatAlign::Right)
        );
        assert_eq!(content.format_ranges[0].format.bold, Some(true));
        assert_eq!(content.format_ranges[0].format.color, Some(0x445566));
        assert_eq!(content.format_ranges[0].format.size, Some(20.0));
        assert_eq!(content.format_ranges[0].format.underline, Some(true));
    }

    #[test]
    fn compute_rich_text_content_condenses_whitespace() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            condense_white: true,
            html_text: "  A \n\t B  ".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "A B ");
    }

    #[test]
    fn compute_rich_text_content_honors_max_chars() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<b>Hello</b> world".to_string(),
            max_chars: 7,
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "Hello w");
        assert_eq!(content.format_ranges.last().unwrap().end, 7);
    }

    #[test]
    fn compute_rich_text_content_masks_with_password_char() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<b>ignored</b>".to_string(),
            text: "secret".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, Some('*'));
        assert_eq!(content.text, "******");
        assert_eq!(content.format_ranges[0].format.bold, None);
    }

    #[test]
    fn compute_rich_text_content_password_falls_back_to_bullet() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            text: "ab".to_string(),
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, Some('\0'));
        assert_eq!(content.text, "\u{2022}\u{2022}");
    }

    #[test]
    fn compute_rich_text_content_applies_serialized_ranges_over_plain_text() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            text: "hello".to_string(),
            text_format_ranges: vec![TextFormatRange {
                start: 1,
                end: 4,
                format: TextFormat {
                    italic: Some(true),
                    ..Default::default()
                },
            }],
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        let mapped: Vec<(usize, usize, Option<bool>)> = content
            .format_ranges
            .iter()
            .map(|r| (r.start, r.end, r.format.italic))
            .collect();
        assert_eq!(mapped, vec![(0, 1, None), (1, 4, Some(true)), (4, 5, None)]);
    }

    #[test]
    fn compute_rich_text_content_merges_serialized_ranges_over_html() {
        let mut content = create_rich_text_content();
        let data = RichTextData {
            html_text: "<b>hello</b>".to_string(),
            text_format_ranges: vec![TextFormatRange {
                start: 1,
                end: 4,
                format: TextFormat {
                    color: Some(0xff0000),
                    ..Default::default()
                },
            }],
            ..create_data()
        };
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.format_ranges[1].format.bold, Some(true));
        assert_eq!(content.format_ranges[1].format.color, Some(0xff0000));
    }

    #[test]
    fn get_rich_text_content_lazy() {
        let mut cache: Option<RichTextContent> = None;
        let _ = get_rich_text_content(&mut cache);
        assert!(cache.is_some());
    }
}
