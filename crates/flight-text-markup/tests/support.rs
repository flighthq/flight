use std::sync::Arc;

use flight_entity::{Record, Ref, set_record_value};
use flight_text_markup::contract::*;
use flight_textlayout::RichTextContent;

pub fn parse_with(html: &str, registry: &MarkupTagRegistry) -> RichTextContent {
    let guards = create_text_markup_guard_state();
    return parse_text_markup(html, Some(registry), &guards);
}

pub fn parse_standard(html: &str) -> RichTextContent {
    let guards = create_text_markup_guard_state();
    return parse_text_markup(html, None, &guards);
}

pub fn format_at(content: &RichTextContent, index: usize) -> TextFormat {
    for range in &content.format_ranges {
        if index >= range.start && index < range.end {
            return range.format.read().unwrap().clone();
        }
    }
    return empty_format();
}
use flight_textformat::TextFormat;

pub fn empty_format() -> TextFormat {
    return TextFormat {
        align: None,
        block_indent: None,
        bold: None,
        bullet: None,
        color: None,
        font: None,
        indent: None,
        italic: None,
        kerning: None,
        leading: None,
        left_margin: None,
        letter_spacing: None,
        list_marker: None,
        right_margin: None,
        size: None,
        strikethrough: None,
        tab_stops: None,
        target: None,
        underline: None,
        url: None,
        variations: None,
    };
}

pub fn attributes(entries: &[(&str, &str)]) -> Record<String> {
    let mut out: Record<String> = Record::default();
    for (name, value) in entries {
        flight_entity::set_record_value(&mut out, String::from(*name), String::from(*value));
    }
    return out;
}

pub fn standard_registry() -> MarkupTagRegistry {
    let mut registry = create_markup_tag_registry();
    register_standard_markup_tags(&mut registry);
    return registry;
}

pub fn format_of(result: MarkupTagResult) -> TextFormat {
    return match result {
        MarkupTagResult::Format(format) => format,
        MarkupTagResult::Effect(effect) => effect.format.unwrap_or_default(),
    };
}

pub fn class_styles(entries: &[(&str, TextFormat)]) -> Ref<Record<TextFormat>> {
    let out: Ref<Record<TextFormat>> = Arc::new(std::sync::RwLock::new(Record::default()));
    for (name, format) in entries {
        set_record_value(
            &mut out.write().unwrap(),
            String::from(*name),
            format.clone(),
        );
    }
    return out;
}
