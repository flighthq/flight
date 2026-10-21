//! The open markup tag registry, the standard htmlText dialect and the hex color seam
//! (TS `markupTagRegistry.ts`).

use std::sync::{Arc, RwLock};

use flight_color::pack_opaque_color;
use flight_entity::{Record, Ref, get_record_value};
use flight_textformat::{TextFormat, TextFormatAlign, TextFormatListMarker};

use crate::types::*;

/// Builds a decoded markup attribute map from name/value pairs (Rust mapping of the TS object
/// literal a handler receives; `Record` has no public constructor in flight-entity).
// flight-lint: allow(conform-extra) D9 Rust constructor for the TS attribute object literal
pub fn create_markup_attributes(entries: &[(&str, &str)]) -> Record<String> {
    let mut out: Record<String> = Record::default();
    for (name, value) in entries {
        flight_entity::set_record_value(&mut out, String::from(*name), String::from(*value));
    }
    return out;
}

// flight-lint: allow(conform-extra) Rust-only shared resolver identity for the hex seam
/// The hex-only color seam installed by `register_standard_markup_tags` (TS `resolveMarkupHexColor`
/// as a resolver value). Sharing one Arc keeps the seam's identity stable for `Arc::ptr_eq`.
pub fn create_markup_hex_resolver() -> MarkupColorResolver {
    return Arc::new(resolve_markup_hex_color);
}

/// Creates an empty markup tag registry (TS `createMarkupTagRegistry`). The registered set of tag
/// names is the supported dialect; the resolver seams start unset.
pub fn create_markup_tag_registry() -> MarkupTagRegistry {
    return MarkupTagRegistry {
        handlers: Vec::new(),
        seams: Arc::new(RwLock::new(MarkupResolverSeams::default())),
    };
}

fn font_tag_handler(seams: Ref<MarkupResolverSeams>) -> MarkupTagHandler {
    return Arc::new(move |attributes: &Record<String>, enclosing: &TextFormat| {
        let mut format = TextFormat::default();
        if let Some(color) = get_record_value(attributes, "color") {
            let resolver = seams.read().unwrap().color_resolver.clone();
            let parsed = match resolver {
                Some(resolver) => resolver(color),
                None => resolve_markup_hex_color(color),
            };
            if let Some(parsed) = parsed {
                format.color = Some(parsed);
            }
        }
        if let Some(size) = get_record_value(attributes, "size") {
            if let Some(parsed) = parse_markup_float(size) {
                let trimmed = size.trim();
                let relative = trimmed.starts_with('+') || trimmed.starts_with('-');
                format.size = Some(if relative {
                    match enclosing.size {
                        Some(base) => base + parsed,
                        None => parsed,
                    }
                } else {
                    parsed
                });
            }
        }
        let face =
            get_record_value(attributes, "face").or_else(|| get_record_value(attributes, "font"));
        if let Some(face) = face {
            if !face.is_empty() {
                format.font = Some(face.clone());
            }
        }
        return MarkupTagResult::Format(format);
    });
}

// flight-lint: allow(conform-extra) Rust lookup for the ordered tag table; TS reads `handlers.get`
pub fn get_markup_tag_handler(
    registry: &MarkupTagRegistry,
    name: &str,
) -> Option<MarkupTagHandler> {
    let name = name.to_lowercase();
    return registry
        .handlers
        .iter()
        .find(|(key, _)| *key == name)
        .map(|(_, handler)| handler.clone());
}

fn is_markup_align(value: &str) -> Option<TextFormatAlign> {
    return match value.to_lowercase().as_str() {
        "center" => Some(TextFormatAlign::Center),
        "end" => Some(TextFormatAlign::End),
        "justify" => Some(TextFormatAlign::Justify),
        "left" => Some(TextFormatAlign::Left),
        "right" => Some(TextFormatAlign::Right),
        "start" => Some(TextFormatAlign::Start),
        _ => None,
    };
}

fn is_markup_list_marker(value: &str) -> Option<TextFormatListMarker> {
    return match value.to_lowercase().as_str() {
        "circle" => Some(TextFormatListMarker::Circle),
        "decimal" => Some(TextFormatListMarker::Decimal),
        "disc" => Some(TextFormatListMarker::Disc),
        "none" => Some(TextFormatListMarker::None),
        "square" => Some(TextFormatListMarker::Square),
        _ => None,
    };
}

fn markup_anchor_tag_handler(
    attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    let mut format = TextFormat::default();
    if let Some(href) = get_record_value(attributes, "href") {
        format.url = Some(href.clone());
    }
    if let Some(target) = get_record_value(attributes, "target") {
        format.target = Some(target.clone());
    }
    return MarkupTagResult::Format(format);
}

fn markup_bold_tag_handler(
    _attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    return MarkupTagResult::Format(TextFormat {
        bold: Some(true),
        ..TextFormat::default()
    });
}

fn markup_break_tag_handler(
    _attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    return MarkupTagResult::Effect(MarkupTagEffect {
        text: Some(String::from("\n")),
        ..MarkupTagEffect::default()
    });
}

fn markup_italic_tag_handler(
    _attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    return MarkupTagResult::Format(TextFormat {
        italic: Some(true),
        ..TextFormat::default()
    });
}

fn markup_list_item_tag_handler(
    attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    let mut format = TextFormat {
        bullet: Some(true),
        ..TextFormat::default()
    };
    if let Some(marker) = get_record_value(attributes, "type") {
        format.list_marker = is_markup_list_marker(marker);
    }
    return MarkupTagResult::Effect(MarkupTagEffect {
        break_before: Some(true),
        format: Some(format),
        text: None,
    });
}

fn markup_paragraph_tag_handler(
    attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    let mut format = TextFormat::default();
    if let Some(align) = get_record_value(attributes, "align") {
        format.align = is_markup_align(align);
    }
    return MarkupTagResult::Effect(MarkupTagEffect {
        break_before: Some(true),
        format: Some(format),
        text: None,
    });
}

fn markup_strikethrough_tag_handler(
    _attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    return MarkupTagResult::Format(TextFormat {
        strikethrough: Some(true),
        ..TextFormat::default()
    });
}

fn markup_textformat_tag_handler(
    attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    let mut format = TextFormat::default();
    if let Some(value) = read_markup_number_attribute(attributes, "blockindent") {
        format.block_indent = Some(value);
    }
    if let Some(value) = read_markup_number_attribute(attributes, "indent") {
        format.indent = Some(value);
    }
    if let Some(value) = read_markup_number_attribute(attributes, "leading") {
        format.leading = Some(value);
    }
    if let Some(value) = read_markup_number_attribute(attributes, "leftmargin") {
        format.left_margin = Some(value);
    }
    if let Some(value) = read_markup_number_attribute(attributes, "rightmargin") {
        format.right_margin = Some(value);
    }
    if let Some(value) = read_markup_tab_stops_attribute(attributes, "tabstops") {
        format.tab_stops = Some(value);
    }
    return MarkupTagResult::Format(format);
}

fn markup_underline_tag_handler(
    _attributes: &Record<String>,
    _enclosing: &TextFormat,
) -> MarkupTagResult {
    return MarkupTagResult::Format(TextFormat {
        underline: Some(true),
        ..TextFormat::default()
    });
}

pub(crate) fn merge_markup_format(base: &TextFormat, contribution: &TextFormat) -> TextFormat {
    let mut out = base.clone();
    if contribution.align.is_some() {
        out.align = contribution.align;
    }
    if contribution.block_indent.is_some() {
        out.block_indent = contribution.block_indent;
    }
    if contribution.bold.is_some() {
        out.bold = contribution.bold;
    }
    if contribution.bullet.is_some() {
        out.bullet = contribution.bullet;
    }
    if contribution.color.is_some() {
        out.color = contribution.color;
    }
    if contribution.font.is_some() {
        out.font = contribution.font.clone();
    }
    if contribution.indent.is_some() {
        out.indent = contribution.indent;
    }
    if contribution.italic.is_some() {
        out.italic = contribution.italic;
    }
    if contribution.kerning.is_some() {
        out.kerning = contribution.kerning;
    }
    if contribution.leading.is_some() {
        out.leading = contribution.leading;
    }
    if contribution.left_margin.is_some() {
        out.left_margin = contribution.left_margin;
    }
    if contribution.letter_spacing.is_some() {
        out.letter_spacing = contribution.letter_spacing;
    }
    if contribution.list_marker.is_some() {
        out.list_marker = contribution.list_marker;
    }
    if contribution.right_margin.is_some() {
        out.right_margin = contribution.right_margin;
    }
    if contribution.size.is_some() {
        out.size = contribution.size;
    }
    if contribution.strikethrough.is_some() {
        out.strikethrough = contribution.strikethrough;
    }
    if contribution.tab_stops.is_some() {
        out.tab_stops = contribution.tab_stops.clone();
    }
    if contribution.target.is_some() {
        out.target = contribution.target.clone();
    }
    if contribution.underline.is_some() {
        out.underline = contribution.underline;
    }
    if contribution.url.is_some() {
        out.url = contribution.url.clone();
    }
    if contribution.variations.is_some() {
        out.variations = contribution.variations.clone();
    }
    return out;
}

// JS `Number.parseFloat` over the prefix it can parse. `Infinity`/`NaN` spellings are not accepted
// here; the source only uses this for numeric attribute authoring.
fn parse_markup_float(value: &str) -> Option<f32> {
    let trimmed = value.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0_usize;
    let mut saw_digit = false;
    if index < bytes.len() && (bytes[index] == b'+' || bytes[index] == b'-') {
        index += 1;
    }
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
        saw_digit = true;
    }
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
            saw_digit = true;
        }
    }
    if saw_digit && index < bytes.len() && (bytes[index] == b'e' || bytes[index] == b'E') {
        let mut cursor = index + 1;
        if cursor < bytes.len() && (bytes[cursor] == b'+' || bytes[cursor] == b'-') {
            cursor += 1;
        }
        let exponent_start = cursor;
        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
            cursor += 1;
        }
        if cursor > exponent_start {
            index = cursor;
        }
    }
    if !saw_digit {
        return None;
    }
    return trimmed[..index].parse::<f32>().ok();
}

fn parse_markup_hex_prefix(value: &str) -> Option<u32> {
    let mut out = 0_u32;
    let mut any = false;
    for character in value.chars() {
        let Some(digit) = character.to_digit(16) else {
            break;
        };
        out = out.wrapping_mul(16).wrapping_add(digit);
        any = true;
    }
    return if any { Some(out) } else { None };
}

fn read_markup_number_attribute(attributes: &Record<String>, name: &str) -> Option<f32> {
    return get_record_value(attributes, name).and_then(|raw| parse_markup_float(raw));
}

fn read_markup_tab_stops_attribute(attributes: &Record<String>, name: &str) -> Option<Vec<f32>> {
    let Some(raw) = get_record_value(attributes, name) else {
        return None;
    };
    let mut stops = Vec::new();
    for part in raw.split(',') {
        if let Some(parsed) = parse_markup_float(part.trim()) {
            stops.push(parsed);
        }
    }
    return Some(stops);
}

/// Binds a tag name to its handler (TS `registerMarkupTag`). Last write wins; the name is stored
/// lowercased so matching is case-insensitive, and a replaced name keeps its position.
pub fn register_markup_tag(
    registry: &mut MarkupTagRegistry,
    name: &str,
    handler: MarkupTagHandler,
) {
    let name = name.to_lowercase();
    if let Some(entry) = registry.handlers.iter_mut().find(|(key, _)| *key == name) {
        entry.1 = handler;
        return;
    }
    registry.handlers.push((name, handler));
}

/// Registers the standard `htmlText` dialect and installs the hex-only color seam
/// (TS `registerStandardMarkupTags`). Class styling stays unset until opted in.
pub fn register_standard_markup_tags(registry: &mut MarkupTagRegistry) {
    registry.seams.write().unwrap().color_resolver = Some(create_markup_hex_resolver());
    let seams = registry.seams.clone();
    register_markup_tag(registry, "a", Arc::new(markup_anchor_tag_handler));
    register_markup_tag(registry, "b", Arc::new(markup_bold_tag_handler));
    register_markup_tag(registry, "br", Arc::new(markup_break_tag_handler));
    register_markup_tag(registry, "em", Arc::new(markup_italic_tag_handler));
    register_markup_tag(registry, "font", font_tag_handler(seams.clone()));
    register_markup_tag(registry, "i", Arc::new(markup_italic_tag_handler));
    register_markup_tag(registry, "li", Arc::new(markup_list_item_tag_handler));
    register_markup_tag(registry, "p", Arc::new(markup_paragraph_tag_handler));
    register_markup_tag(registry, "s", Arc::new(markup_strikethrough_tag_handler));
    register_markup_tag(registry, "span", span_tag_handler(seams));
    register_markup_tag(
        registry,
        "strike",
        Arc::new(markup_strikethrough_tag_handler),
    );
    register_markup_tag(registry, "strong", Arc::new(markup_bold_tag_handler));
    register_markup_tag(
        registry,
        "textformat",
        Arc::new(markup_textformat_tag_handler),
    );
    register_markup_tag(registry, "u", Arc::new(markup_underline_tag_handler));
}

/// Resolves a hex `<font color>` value — `#rgb`, `#rrggbb`, or `0xRRGGBB` — to packed `0xRRGGBBAA`,
/// or `None` (TS `resolveMarkupHexColor`). No named-color table is reachable from this path.
pub fn resolve_markup_hex_color(value: &str) -> Option<u32> {
    let color = value.trim().to_lowercase();
    if let Some(hex) = color.strip_prefix('#') {
        let characters: Vec<char> = hex.chars().collect();
        if characters.len() == 3 {
            let expanded = format!(
                "{0}{0}{1}{1}{2}{2}",
                characters[0], characters[1], characters[2]
            );
            return parse_markup_hex_prefix(&expanded).map(pack_opaque_color);
        }
        if characters.len() != 6 {
            return None;
        }
        return parse_markup_hex_prefix(hex).map(pack_opaque_color);
    }
    if let Some(hex) = color.strip_prefix("0x") {
        if hex.chars().count() != 6 {
            return None;
        }
        return parse_markup_hex_prefix(hex).map(pack_opaque_color);
    }
    return None;
}

fn span_tag_handler(seams: Ref<MarkupResolverSeams>) -> MarkupTagHandler {
    return Arc::new(
        move |attributes: &Record<String>, _enclosing: &TextFormat| {
            let Some(classes) = get_record_value(attributes, "class") else {
                return MarkupTagResult::Format(TextFormat::default());
            };
            let resolver = seams.read().unwrap().class_resolver.clone();
            let Some(resolver) = resolver else {
                return MarkupTagResult::Format(TextFormat::default());
            };
            let mut format = TextFormat::default();
            for name in classes.split(|character: char| character.is_whitespace()) {
                if name.is_empty() {
                    continue;
                }
                if let Some(contribution) = resolver(name) {
                    format = merge_markup_format(&format, &contribution);
                }
            }
            return MarkupTagResult::Format(format);
        },
    );
}
