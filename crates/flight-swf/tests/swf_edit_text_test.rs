use std::sync::Arc;

use flight_entity::Ref;
use flight_swf::{SwfFontNameResolver, read_swf_edit_text_factory};
use flight_text::RichText;

use crate::support::reader;

mod read_swf_edit_text_factory {
    use super::*;

    #[test]
    fn keeps_the_authored_string_assignable_as_text() {
        let field = build(&field_options("Score"), |_| String::new());
        assert_eq!(field.read().unwrap().data.text, "Score");
        field.write().unwrap().data.text = "changed".to_string();
        assert_eq!(field.read().unwrap().data.text, "changed");
    }

    #[test]
    fn resolves_the_referenced_font_family_at_construction() {
        let mut options = field_options("");
        options.font_id = Some(7);
        let field = build(&options, |font_id| {
            if font_id == 7 {
                "Arial".to_string()
            } else {
                String::new()
            }
        });
        let format = field.read().unwrap().data.default_text_format.clone();
        assert_eq!(format.read().unwrap().font.as_deref(), Some("Arial"));

        options.font_id = Some(9);
        let unnamed = build(&options, |_| String::new());
        let format = unnamed.read().unwrap().data.default_text_format.clone();
        assert_eq!(format.read().unwrap().font, None);
    }

    #[test]
    fn converts_every_authored_measurement_out_of_twips() {
        let mut options = field_options("");
        options.font_height = Some(240);
        options.indent = Some(60);
        options.leading = Some(80);
        options.left_margin = Some(20);
        options.right_margin = Some(40);
        let field = build(&options, |_| String::new());
        let format = field.read().unwrap().data.default_text_format.clone();
        let guard = format.read().unwrap();
        assert_eq!(guard.indent, Some(3.0));
        assert_eq!(guard.leading, Some(4.0));
        assert_eq!(guard.left_margin, Some(1.0));
        assert_eq!(guard.right_margin, Some(2.0));
        assert_eq!(guard.size, Some(12.0));
    }

    #[test]
    fn carries_the_fields_defining_flags() {
        let mut options = field_options("");
        options.border = true;
        options.multiline = true;
        options.no_select = true;
        options.word_wrap = true;
        let field = build(&options, |_| String::new());
        let guard = field.read().unwrap();
        assert!(guard.data.multiline);
        assert!(guard.data.word_wrap);
        assert!(guard.data.border);
        assert!(!guard.data.selectable);
        assert_eq!(guard.data.max_chars, -1);
    }

    #[test]
    fn preserves_an_authored_maximum_character_count() {
        let mut options = field_options("limited");
        options.max_chars = Some(12);
        let field = build(&options, |_| String::new());
        assert_eq!(field.read().unwrap().data.max_chars, 12);
    }

    #[test]
    fn preserves_the_authored_rgba_text_color() {
        let mut options = field_options("Color");
        options.color = Some(0x11223344);
        let field = build(&options, |_| String::new());
        let guard = field.read().unwrap();
        assert_eq!(guard.data.text_color, 0x11223344);
        assert_eq!(
            guard.data.default_text_format.read().unwrap().color,
            Some(0x11223344)
        );
    }

    #[test]
    fn preserves_authored_zero_alpha() {
        let mut options = field_options("Transparent");
        options.color = Some(0x11223300);
        let field = build(&options, |_| String::new());
        let guard = field.read().unwrap();
        assert_eq!(guard.data.text_color, 0x11223300);
        assert_eq!(
            guard.data.default_text_format.read().unwrap().color,
            Some(0x11223300)
        );
    }

    #[test]
    fn uses_opaque_black_when_the_tag_omits_text_color() {
        let mut options = field_options("Default");
        options.color = None;
        let field = build(&options, |_| String::new());
        let guard = field.read().unwrap();
        assert_eq!(guard.data.text_color, 0x000000ff);
        assert_eq!(guard.data.default_text_format.read().unwrap().color, None);
    }

    #[test]
    fn parses_flagged_html_into_text_and_format_ranges() {
        let mut options = field_options("Hit <b>hard</b> now");
        options.html = true;
        let field = build(&options, |_| String::new());
        let guard = field.read().unwrap();
        assert_eq!(guard.data.text, "Hit hard now");
        assert_eq!(guard.data.text_format_ranges.len(), 1);
        let range = &guard.data.text_format_ranges[0];
        assert_eq!(range.start, 4);
        assert_eq!(range.end, 8);
        assert_eq!(range.format.read().unwrap().bold, Some(true));
    }

    #[test]
    fn keeps_unflagged_markup_verbatim() {
        let options = field_options("Hit <b>hard</b> now");
        let field = build(&options, |_| String::new());
        let guard = field.read().unwrap();
        assert_eq!(guard.data.text, "Hit <b>hard</b> now");
        assert!(guard.data.text_format_ranges.is_empty());
    }

    #[test]
    fn returns_none_for_a_truncated_field() {
        let mut bytes = bytes_for(&field_options("x"));
        bytes.pop();
        let mut source = reader(bytes);
        assert!(read_swf_edit_text_factory(&mut source, 10.0, 10.0).is_none());
    }
}

fn build(
    options: &FieldOptions,
    resolve: impl Fn(u32) -> String + Send + Sync + 'static,
) -> Ref<RichText> {
    let mut source = reader(bytes_for(options));
    let factory = read_swf_edit_text_factory(&mut source, 100.0, 20.0).unwrap();
    let resolve: SwfFontNameResolver = Arc::new(resolve);
    return factory(&resolve);
}

fn bytes_for(options: &FieldOptions) -> Vec<u8> {
    let mut bytes = Vec::new();
    let flags = EDIT_TEXT_HAS_TEXT
        | EDIT_TEXT_HAS_FONT
        | u8::from(options.color.is_some()) * EDIT_TEXT_HAS_TEXT_COLOR
        | u8::from(options.word_wrap) * EDIT_TEXT_WORD_WRAP
        | u8::from(options.multiline) * EDIT_TEXT_MULTILINE
        | u8::from(options.max_chars.is_some()) * EDIT_TEXT_HAS_MAX_LENGTH;
    let layout_flags = EDIT_TEXT_HAS_LAYOUT
        | u8::from(options.border) * EDIT_TEXT_BORDER
        | u8::from(options.no_select) * EDIT_TEXT_NO_SELECT
        | u8::from(options.html) * EDIT_TEXT_HTML;
    bytes.push(flags);
    bytes.push(layout_flags);
    push_u16(&mut bytes, options.font_id.unwrap_or(1));
    push_u16(&mut bytes, options.font_height.unwrap_or(200));
    if let Some(color) = options.color {
        bytes.push((color >> 24) as u8);
        bytes.push((color >> 16) as u8);
        bytes.push((color >> 8) as u8);
        bytes.push(color as u8);
    }
    if let Some(max_chars) = options.max_chars {
        push_u16(&mut bytes, max_chars);
    }
    bytes.push(0);
    push_u16(&mut bytes, options.left_margin.unwrap_or(0));
    push_u16(&mut bytes, options.right_margin.unwrap_or(0));
    push_u16(&mut bytes, options.indent.unwrap_or(0));
    push_u16(&mut bytes, options.leading.unwrap_or(0));
    push_string(&mut bytes, "variable");
    push_string(&mut bytes, options.text);
    return bytes;
}

fn field_options(text: &str) -> FieldOptions<'_> {
    return FieldOptions {
        border: false,
        color: Some(0x112233ff),
        font_height: None,
        font_id: None,
        html: false,
        indent: None,
        leading: None,
        left_margin: None,
        max_chars: None,
        multiline: false,
        no_select: false,
        right_margin: None,
        text,
        word_wrap: false,
    };
}

fn push_string(bytes: &mut Vec<u8>, value: &str) {
    bytes.extend_from_slice(value.as_bytes());
    bytes.push(0);
}

fn push_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.push(value as u8);
    bytes.push((value >> 8) as u8);
}

struct FieldOptions<'a> {
    border: bool,
    color: Option<u32>,
    font_height: Option<u16>,
    font_id: Option<u16>,
    html: bool,
    indent: Option<u16>,
    leading: Option<u16>,
    left_margin: Option<u16>,
    max_chars: Option<u16>,
    multiline: bool,
    no_select: bool,
    right_margin: Option<u16>,
    text: &'a str,
    word_wrap: bool,
}

const EDIT_TEXT_BORDER: u8 = 0x08;
const EDIT_TEXT_HAS_FONT: u8 = 0x01;
const EDIT_TEXT_HAS_LAYOUT: u8 = 0x20;
const EDIT_TEXT_HAS_MAX_LENGTH: u8 = 0x02;
const EDIT_TEXT_HAS_TEXT: u8 = 0x80;
const EDIT_TEXT_HAS_TEXT_COLOR: u8 = 0x04;
const EDIT_TEXT_HTML: u8 = 0x02;
const EDIT_TEXT_MULTILINE: u8 = 0x20;
const EDIT_TEXT_NO_SELECT: u8 = 0x10;
const EDIT_TEXT_WORD_WRAP: u8 = 0x40;
